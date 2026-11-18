/**
 * 設定変更のための第2要素コード送信API
 * POST /api/user/totp/send-challenge
 *
 * 無効化とリカバリーコード再発行は `requireSecondFactor` でコードを要求する。
 * TOTP なら手元の認証アプリで作れるが、メールOTP では**コードを取得する経路が
 * 必要**になる。
 *
 * これが無いと、メールOTP を有効にした利用者は二度と無効化できない。
 * 再セットアップは `TotpAlreadyEnabledError` で弾かれ、パスワードリセットは
 * 意図的に第2要素へ触れないため、リカバリーコードを使い切った時点で
 * 方式を変えることも二段階認証を外すこともできなくなる。
 *
 * ⚠️ 宛先はセッションのユーザーに固定する。ボディの値は一切見ない（#641）。
 *
 * ⚠️ `TOTP_SETTINGS_VERIFY` は消費しない。送信と検証でカウンタを重ねると、
 * メールOTP の利用者は無効化のたびに2枠使い、2回しくじるだけで15分間
 * すべての二段階認証操作が 429 になる。レート制限は `TWO_FACTOR_SEND` の
 * 1本だけで、`sendSecondFactorCode` の中（送信の直前＝例外2）にある。
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { errorResponse } from '@/helpers/secondFactorGuard';
import { getSecondFactorMethod } from '@/lib/auth/secondFactor';
import {
  SEND_SECOND_FACTOR_RESULT,
  sendSecondFactorCode,
} from '@/lib/auth/sendSecondFactorCode';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { OTP_ERROR_MESSAGES } from '@/constants/otp';
import { TOTP_ERROR_MESSAGES } from '@/constants/totp';
import {
  SECOND_FACTOR_MESSAGES,
  SECOND_FACTOR_METHOD,
} from '@/constants/secondFactor';

export async function POST() {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const method = await getSecondFactorMethod(supabase, session.user.id);

    // TOTP の利用者には送らない。手元の認証アプリで作れるので不要だし、
    // 送れてしまうと「送信経路を1つ増やしただけ」になる
    if (method !== SECOND_FACTOR_METHOD.EMAIL_OTP) {
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        TOTP_ERROR_MESSAGES.NOT_CONFIGURED,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', session.user.id)
      .single();

    // 読み取りに失敗しただけで 401 を返さない。axios のインターセプタが
    // 401 を「未認証」と解釈して強制ログアウトへ倒すため
    if (userError) throw userError;
    if (!user?.email) return unauthorizedResponse();

    const result = await sendSecondFactorCode(
      supabase,
      session.user.id,
      user.email,
    );

    if (result === SEND_SECOND_FACTOR_RESULT.SEND_FAILED) {
      return errorResponse(
        ERROR_CODE.SERVER_ERROR,
        SECOND_FACTOR_MESSAGES.SEND_FAILED,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    if (result === SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED) {
      // 1通も送っていない。コードを待たせず、リカバリーコードへ誘導する
      return errorResponse(
        ERROR_CODE.RATE_LIMIT_EXCEEDED,
        // ここはリカバリーコードを持っているが、する操作は「ログイン」ではない
        SECOND_FACTOR_MESSAGES.SEND_LIMIT_EXCEEDED_SETTINGS,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    if (result === SEND_SECOND_FACTOR_RESULT.THROTTLED) {
      // 直前に送ったコードがまだ生きている。待ってもらう
      return errorResponse(
        ERROR_CODE.RATE_LIMIT_EXCEEDED,
        OTP_ERROR_MESSAGES.RESEND_TOO_SOON,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    return NextResponse.json(
      { success: true, message: SECOND_FACTOR_MESSAGES.CODE_SENT },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Second factor send-challenge error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      TOTP_ERROR_MESSAGES.OPERATION_FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
