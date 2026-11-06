/**
 * 二段階認証の設定変更を守るガード
 *
 * 無効化・リカバリーコード再発行は、セッションだけでは通さない。
 * セッションを奪われただけで第2要素を外せたら、二段階認証の意味がない。
 */

import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

import {
  isTotpEnabled,
  TOTP_VERIFY_RESULT,
  verifySecondFactor,
} from '@/lib/auth/totpVerification';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';
import { HTTP_STATUS, ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { TOTP_ERROR_MESSAGES, TOTP_SETTINGS_LIMIT } from '@/constants/totp';

/** エラーレスポンスを組み立てる */
const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

/**
 * 二段階認証の設定変更に対するレート制限を消費する
 *
 * `requireSecondFactor` から切り出してある。レート制限は識別子（ユーザーID）が
 * 確定した直後 — つまり**リクエストの検証より前** — に置く決まりで
 * （`.claude/rules/api-route.md`「レート制限と検証の順序」）、ガード本体は
 * 検証済みの `code` を要るため同じ位置に置けない。呼び出し側は認証の直後に
 * これを呼び、通過してから検証と `requireSecondFactor` に進むこと。
 *
 * なお #940 以前は `isTotpEnabled` の後で数えていたため、二段階認証が未設定の
 * ユーザーは枠を消費しなかった。現在は先に数える。画面上そこへ到達できるのは
 * 設定済みの利用者だけなので実害は無い。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @returns 通過したら null、上限超過なら429のレスポンス
 */
export async function checkSecondFactorRateLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  // ここが総当たりの入口になるため、ログイン時と同じ厳しさで止める
  const limitResult = await checkRateLimit(
    supabase,
    userId,
    RATE_LIMIT_ACTION.TOTP_VERIFY,
    TOTP_SETTINGS_LIMIT.maxAttempts,
    TOTP_SETTINGS_LIMIT.windowMinutes,
  );

  if (!limitResult.allowed) {
    return errorResponse(
      ERROR_CODE.RATE_LIMIT_EXCEEDED,
      AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
      HTTP_STATUS.TOO_MANY_REQUESTS,
    );
  }

  return null;
}

/**
 * 所持の証明（認証アプリのコード or リカバリーコード）を要求する
 *
 * ⚠️ レート制限は含まない。呼び出す前に `checkSecondFactorRateLimit` を
 * 通していること。分けている理由は同関数のコメントを参照
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param code - 利用者が入力したコード
 * @returns 通過したら null、弾いたらその理由のレスポンス
 */
export async function requireSecondFactor(
  supabase: SupabaseClient,
  userId: string,
  code: string,
): Promise<NextResponse | null> {
  if (!(await isTotpEnabled(supabase, userId))) {
    return errorResponse(
      ERROR_CODE.BAD_REQUEST,
      TOTP_ERROR_MESSAGES.NOT_CONFIGURED,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const verifyResult = await verifySecondFactor(supabase, userId, code);

  if (verifyResult === TOTP_VERIFY_RESULT.REUSED) {
    return errorResponse(
      ERROR_CODE.BAD_REQUEST,
      TOTP_ERROR_MESSAGES.CODE_ALREADY_USED,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  if (verifyResult !== TOTP_VERIFY_RESULT.SUCCESS) {
    return errorResponse(
      ERROR_CODE.BAD_REQUEST,
      TOTP_ERROR_MESSAGES.INVALID_CODE,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  await resetRateLimit(supabase, userId, RATE_LIMIT_ACTION.TOTP_VERIFY);

  return null;
}
