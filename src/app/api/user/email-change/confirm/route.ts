/**
 * メールアドレス変更: 確認コードの検証と差し替え（#1359）
 * POST /api/user/email-change/confirm
 *
 * ⚠️ **成功するとログイン識別子が変わる。** 旧アドレスではもうログイン
 * できないので、通知は旧アドレスへ送る（乗っ取りに気づける唯一の手段）。
 */

import { NextResponse } from 'next/server';

import {
  ERROR_CODE,
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { EMAIL_CHANGE_MESSAGES } from '@/constants/emailChange';
import { OTP_ERROR_MESSAGES } from '@/constants/otp';
import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { requireSecondFactor } from '@/helpers/secondFactorGuard';
import { parseAndValidate } from '@/helpers/requestValidation';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  EMAIL_CHANGE_VERIFY_RESULT,
  consumeEmailChangeCode,
} from '@/lib/auth/emailChange';
import { getSecondFactorMethod } from '@/lib/auth/secondFactor';
import { sendEmailChangedNotice } from '@/lib/auth/sendEmailChangedNotice';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { emailChangeConfirmSchema } from '@/schema/auth';

/** 一意制約違反。重複は UNIQUE が弾く */
const UNIQUE_VIOLATION = '23505';

/** 統一エラーレスポンス */
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限は検証より前。識別子がセッションなのでここで確定している
    // （`.claude/rules/api-route.md` の原則）
    //
    // ⚠️ `otp_codes.attempts`（上限5）は**コード1本あたり**の試行しか
    //   数えない。送信枠とは別のカウンタで、コードを作り直しながらの
    //   総当たりを抑える
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.EMAIL_CHANGE_VERIFY,
      RATE_LIMIT_CONFIG.EMAIL_CHANGE_VERIFY.maxAttempts,
      RATE_LIMIT_CONFIG.EMAIL_CHANGE_VERIFY.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
            details: { retryAfter: rateLimitResult.retryAfter },
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    const parsed = await parseAndValidate(
      request,
      emailChangeConfirmSchema,
      AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
    );

    if (parsed.error) return parsed.error;

    const { newEmail, code } = parsed.data;

    // ⚠️ **第2要素を設定しているなら要求する**（#1359 のレビュー）。
    //
    //   アドレス変更の結果は**復旧経路の喪失**で、パスワード変更より重い。
    //   退会（#932）・二段階認証の無効化・リカバリーコードの再発行が
    //   いずれも第2要素を要求しているのに、ここだけ外れていた。
    //
    // ⚠️ 設定している人にだけ要求する。`requireSecondFactor` は未設定だと
    //   400 を返すため、無条件に呼ぶと未設定の利用者が変更できなくなる。
    //
    // ⛔ **確認コードを消費する前に置く**（2回目のレビュー）。後ろに置くと、
    //   第2要素を1文字打ち間違えるたびに使い捨てのメール確認コードが
    //   先に焼ける。やり直すには再送（60秒待ち＋`EMAIL_CHANGE_REQUEST` を
    //   1枠消費）が要り、**5回のタイプミスで60分ロック**になる。
    //   退会（`user/route.ts`）も第2要素の後ろに破壊的操作を置いている。
    //
    // ⚠️ `TOTP_SETTINGS_VERIFY` は消費しない。手前の `EMAIL_CHANGE_VERIFY` が
    //   同じ利用者IDで数えており、重ねると1回の試行で2枠減る
    //   （`user/route.ts` の `ACCOUNT_DELETE` と同じ判断）
    const secondFactorMethod = await getSecondFactorMethod(
      supabase,
      session.user.id,
    );

    if (secondFactorMethod) {
      const guardResponse = await requireSecondFactor(
        supabase,
        session.user.id,
        parsed.data.secondFactorCode ?? '',
      );

      if (guardResponse) return guardResponse;
    }

    // ⛔ `session.user.id` を渡すこと。外すと、攻撃者が自分のアカウントで
    //   取ったコードを奪った被害者のセッションで使える（#1359 critical）
    const verifyResult = await consumeEmailChangeCode(
      supabase,
      session.user.id,
      newEmail,
      code,
    );

    if (verifyResult !== EMAIL_CHANGE_VERIFY_RESULT.SUCCESS) {
      return errorResponse(
        ERROR_CODE.VALIDATION_ERROR,
        OTP_ERROR_MESSAGES.INVALID_CODE,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // ⚠️ 旧アドレスの `rate_limits` / `otp_codes` も同じトランザクションで消す。
    //   残すと古いアドレスの行が永久に残り、新しいアドレスは枠0から始まる
    const { data: oldEmail, error: changeError } = await supabase.rpc(
      'change_user_email',
      { p_user_id: session.user.id, p_new_email: newEmail },
    );

    if (changeError) {
      // ⚠️ 事前チェックと UPDATE の間に別の利用者が同じアドレスを取った場合。
      //   利用者向けの文言へ変換する（500 だと何が起きたか伝わらない）
      if (changeError.code === UNIQUE_VIOLATION) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          EMAIL_CHANGE_MESSAGES.ALREADY_USED,
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      throw changeError;
    }

    // ⚠️ **戻り値で止めない。** 変更はもう確定しており、ここで 500 にすると
    //   正しいコードを入れた利用者が「失敗した」と思って同じ操作を繰り返す
    //   行き止まりを作る（`sendPasswordInvalidatedEmail` と同じ契約）
    if (typeof oldEmail === 'string') {
      await sendEmailChangedNotice(oldEmail, newEmail);
    }

    return NextResponse.json(
      { success: true, message: EMAIL_CHANGE_MESSAGES.CHANGED },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Email change confirm error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      EMAIL_CHANGE_MESSAGES.FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
