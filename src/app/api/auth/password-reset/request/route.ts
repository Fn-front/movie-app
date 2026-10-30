/**
 * パスワードリセット発行API
 * POST /api/auth/password-reset/request
 *
 * 入力されたメールアドレスが登録済みかどうかにかかわらず、**常に同じ応答**を
 * 返す。文面・ステータス・所要時間のいずれかが変わると、どのメールアドレスが
 * 登録済みかを総当たりで調べられる。
 */

import { NextResponse } from 'next/server';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { passwordResetRequestSchema } from '@/schema/auth';
import {
  PASSWORD_RESET_CONFIG,
  PASSWORD_RESET_MESSAGES,
} from '@/constants/passwordReset';
import {
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
  ROUTES,
} from '@/constants';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { issuePasswordResetToken } from '@/lib/auth/passwordResetToken';
import { sendPasswordResetEmail } from '@/lib/auth/sendPasswordResetEmail';
import { randomDelay } from '@/lib/otp';
import { isSyntheticEmail } from '@/lib/auth/accountIdentity';
import { getRequiredEnv } from '@/utils/env';

/** 登録の有無にかかわらず返す応答 */
const acceptedResponse = () =>
  NextResponse.json(
    { success: true, message: PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED },
    { status: HTTP_STATUS.OK },
  );

/**
 * 再設定URLを組み立てる
 *
 * ベースURLはリクエストの Host ヘッダではなく設定値から取る。
 * Host を信用すると、攻撃者が仕込んだホスト宛のリンクをメールで配れてしまい、
 * 正規のメールからトークンを盗まれる。
 *
 * @param token - 平文トークン
 * @returns 再設定ページのURL
 */
function buildResetUrl(token: string): string {
  const url = new URL(ROUTES.RESET_PASSWORD, getRequiredEnv('NEXTAUTH_URL'));
  url.searchParams.set('token', token);
  return url.toString();
}

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const body = await request.json();
    const result = passwordResetRequestSchema.safeParse(body);

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

    // スキーマ側で正規化済み（normalizedEmailSchema）
    const { email } = result.data;

    // 発行上限。識別子はメールアドレスのまま（送信元IPを混ぜない）。
    // IPごとにカウンタが分かれると、同一メールボックスへの送信数を
    // IP数だけ掛け算できてしまい、保護の目的そのものが壊れる（#641 と同じ理屈）
    const limitResult = await checkRateLimit(
      supabase,
      email,
      RATE_LIMIT_ACTION.PASSWORD_RESET_REQUEST,
      PASSWORD_RESET_CONFIG.REQUEST_LIMIT.maxAttempts,
      PASSWORD_RESET_CONFIG.REQUEST_LIMIT.windowMinutes,
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
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: limitResult.retryAfter
            ? { 'Retry-After': String(limitResult.retryAfter) }
            : undefined,
        },
      );
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, is_verified')
      .eq('email', email)
      .maybeSingle();

    // 未登録、またはメール未確認のアカウント。
    //
    // 未確認のアカウントにリンクを送らないのは、他人のアドレスで登録しておいて
    // リセット経由でそのアドレスを「確認済み」相当に昇格させる筋を残さないため。
    // どちらの場合も応答は成功と同じにし、遅延を挟んで所要時間も揃える
    //
    // 合成アドレス（admin 発行アカウント）も同じ扱いにする。`.invalid` 宛は
    // 必ず送信に失敗し、下の `!sent` 分岐が 500 を返すため、そのアドレスが
    // 登録済みであることが漏れる。これらの復旧は admin の再発行で行う
    // （`.claude/documents/admin-account-design.md`）。
    if (!user || !user.is_verified || isSyntheticEmail(email)) {
      await randomDelay();
      return acceptedResponse();
    }

    // パスワード未設定（ソーシャルログインのみ）のユーザーも同じ扱いにする。
    // 「このメールはソーシャル専用です」と返すとアカウントの種別が漏れるうえ、
    // リセット経由でパスワードを設定できて困ることもない（メール受信箱を
    // 押さえられている時点で、既存パスワードがあっても書き換えられる）

    const token = await issuePasswordResetToken(supabase, user.id);
    const sent = await sendPasswordResetEmail(email, buildResetUrl(token));

    if (!sent) {
      // 送信できなかったことは利用者に伝える必要がある。
      // ここは「登録済みである」ことを明かすが、送信失敗はメールアドレスの
      // 登録有無に依存しない事象なので列挙には使えない
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: PASSWORD_RESET_MESSAGES.RESET_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    return acceptedResponse();
  } catch (error) {
    console.error('Password reset request error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: PASSWORD_RESET_MESSAGES.RESET_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
