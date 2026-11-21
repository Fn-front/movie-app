/**
 * 設定変更の再認証（#1368）
 *
 * ⛔ **セッションだけで通してよい操作とそうでない操作がある。**
 *
 * 二段階認証の設定は後者。`totp/setup` も `totp/enable` も
 * `getAuthSession()` 以外に何も要求していなかったため、セッションを奪った
 * 第三者が**被害者のアカウントに自分の第2要素を登録できた**。
 * 登録された第2要素は**乗っ取りの固定手段**になる（被害者が後から
 * パスワードを変えても攻撃者の TOTP は残る）。
 *
 * 持っているものに応じて1つだけ要求する。
 *
 * | 利用者 | 要求するもの |
 * |---|---|
 * | パスワードを持つ | 現在のパスワード |
 * | パスワードを持たない（OAuth のみ） | 登録アドレスへの使い捨てコード |
 *
 * ⛔ **「第2要素を持っていること」を再認証として数えない。** 第2要素は
 * まさにこの経路で自己登録できるので、攻撃者が自分で設定して自分で通せる
 * （#1362 のレビューで critical になった形）。
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { ERROR_CODE, HTTP_STATUS } from '@/constants';
import type { SupabaseClient } from '@supabase/supabase-js';

import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import {
  SECOND_FACTOR_SETUP_CODE_MESSAGES,
  SECOND_FACTOR_SETUP_OTP_ACTION,
} from '@/constants/secondFactorSetupCode';
import {
  USER_BOUND_OTP_VERIFY_RESULT,
  consumeUserBoundOtp,
} from '@/lib/auth/userBoundOtp';

/** 再認証に使える材料 */
export interface ReauthInput {
  /** 現在のパスワード。持っている利用者はこちら */
  currentPassword?: string;
  /** 登録アドレスへ送った確認コード。パスワードを持たない利用者はこちら */
  reauthCode?: string;
}

/** 再認証の対象となる利用者 */
export interface ReauthUser {
  id: string;
  email: string;
  password_hash: string | null;
}

/** 統一エラーレスポンス */
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

/**
 * 再認証を要求する
 *
 * ⚠️ **通ったときだけ `null` を返す**（`requireSecondFactor` と同じ形）。
 * 呼び出し側は戻り値が非 null ならそのまま返す。
 *
 * ⚠️ **破壊的な操作より前に呼ぶ。** 後ろに置くと、再認証で落ちたときには
 * もう `user_totp` の行が作り直されている。
 *
 * @param supabase - service_role のクライアント
 * @param user - `users` から引いた対象（`id` / `email` / `password_hash`）
 * @param input - 利用者が出した材料
 * @returns 通れば `null`、通らなければ返すべきレスポンス
 */
export async function requireReauth(
  supabase: SupabaseClient,
  user: ReauthUser,
  input: ReauthInput,
): Promise<NextResponse | null> {
  // パスワードを持つ利用者 —— 記憶の照合で足りる
  if (user.password_hash) {
    if (!input.currentPassword) {
      return errorResponse(
        ERROR_CODE.VALIDATION_ERROR,
        SECOND_FACTOR_SETUP_CODE_MESSAGES.REAUTH_REQUIRED,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const matches = await bcrypt.compare(
      input.currentPassword,
      user.password_hash,
    );

    if (!matches) {
      return errorResponse(
        ERROR_CODE.VALIDATION_ERROR,
        AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    return null;
  }

  // パスワードを持たない利用者（OAuth のみ）—— 受信箱の所持で確かめる
  if (!input.reauthCode) {
    return errorResponse(
      ERROR_CODE.VALIDATION_ERROR,
      SECOND_FACTOR_SETUP_CODE_MESSAGES.REAUTH_REQUIRED,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // ⛔ `user.id` を渡すこと。外すと、攻撃者が自分のアカウントで取ったコードを
  //   奪った被害者のセッションで使える（#1359 の critical）
  const result = await consumeUserBoundOtp(
    supabase,
    user.id,
    user.email,
    SECOND_FACTOR_SETUP_OTP_ACTION,
    input.reauthCode,
  );

  if (result !== USER_BOUND_OTP_VERIFY_RESULT.SUCCESS) {
    return errorResponse(
      ERROR_CODE.VALIDATION_ERROR,
      SECOND_FACTOR_SETUP_CODE_MESSAGES.CODE_INVALID,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  return null;
}
