/**
 * 二段階認証の有効化API
 * POST /api/user/totp/enable
 *
 * 初回コード（認証アプリの6桁 / メールで届いた6桁）を検証し、成功した場合だけ
 * 有効化する。QRを表示しただけで有効にすると、登録に失敗した利用者が
 * ロックアウトされる。
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { sendSecondFactorEnabledNotice } from '@/lib/auth/sendSecondFactorEnabledNotice';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { confirmSecondFactorSetup } from '@/lib/auth/totpSetup';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';
import { totpEnableSchema } from '@/schema/totp';
import { HTTP_STATUS, ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { TOTP_ERROR_MESSAGES, TOTP_SETTINGS_LIMIT } from '@/constants/totp';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 6桁 = 100万通り。上限が無いと総当たりで有効化できてしまう。
    //
    // 識別子はセッションなので検証より前に確定している。検証を先に置くと、
    // 形式だけ崩したリクエストを挟んでカウンタを消費せずに試行を続けられる
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」）
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.TOTP_SETTINGS_VERIFY,
      TOTP_SETTINGS_LIMIT.maxAttempts,
      TOTP_SETTINGS_LIMIT.windowMinutes,
    );

    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    const body = await request.json();
    const result = totpEnableSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // メールOTP の照合に本人のアドレスが要る。
    // 読み取りに失敗しただけで 401 を返さない（axios のインターセプタが
    // 401 を「未認証」と解釈して強制ログアウトへ倒すため）
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', session.user.id)
      .single();

    if (userError) throw userError;
    if (!user) return unauthorizedResponse();

    const confirmed = await confirmSecondFactorSetup(
      supabase,
      session.user.id,
      result.data.code,
      user.email,
    );

    if (!confirmed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: TOTP_ERROR_MESSAGES.INVALID_CODE,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    await resetRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.TOTP_SETTINGS_VERIFY,
    );

    // ⛔ **身に覚えのない登録に気づける唯一の手段**（#1368）。
    //
    //   第2要素が登録されると以降のログインにそのコードが要る。攻撃者が
    //   登録した場合、被害者は自分が設定していない第2要素を求められ、
    //   リカバリーコードも持っていない。
    //
    //   `totp/setup` の再認証で登録そのものは塞いだが、**通知が無いと
    //   塞ぎ漏れがあったときに誰も気づけない**。
    //
    // ⚠️ **有効化が確定した後ろに、throw しうる処理を増やさない。**
    //   ここで 500 にすると**リカバリーコードを一度も表示できない**まま
    //   終わる（平文はこの応答にしか出ない）。
    //
    //   一度この通知のために `getSecondFactorMethod` を呼んでいたが、
    //   あれは DB エラーで throw する（`secondFactor.ts` の `toDbError`）。
    //   方式は `confirmSecondFactorSetup` が既に読んでいるので返させる。
    //
    //   `sendSecondFactorEnabledNotice` 自体は throw しない契約
    //   （送信失敗は false を返すだけ）。戻り値も見ない
    await sendSecondFactorEnabledNotice(user.email, confirmed.method);

    return NextResponse.json(
      {
        success: true,
        message: TOTP_ERROR_MESSAGES.ENABLED,
        // 平文はここでしか返さない。利用者が控えそこねたら再発行してもらう
        data: { recoveryCodes: confirmed.codes },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('TOTP enable error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: TOTP_ERROR_MESSAGES.OPERATION_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
