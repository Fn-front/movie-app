/**
 * 退会の確認コード（#1362）
 *
 * ⛔ **この用途のコードはここからしか作らない。**
 *
 * `OTP_ACTION`（公開ルートが受け付ける用途）に入れると
 * `/api/auth/otp/send` が受理する。あちらの分岐は宛先をセッションに固定する
 * 処理を `password_change` のときしか行わないため、**未認証のまま任意の
 * アドレスへ自サービス名義の確認コードを送れる**状態になる（#641 / #1261）。
 *
 * ⚠️ 届くのは**本人の登録アドレス**だが、文面は「退会」と読めなければ
 * ならない。`two_factor` を流用すると件名・本文が「二段階認証」になり、
 * 用途を明記して読み上げ型のソーシャルエンジニアリングを防ぐ設計（#648）が
 * 崩れる。
 *
 * ---
 *
 * **中身は `userBoundOtp.ts` に寄せてある（#1368）。**
 *
 * 二段階認証の設定（`second_factor_setup`）がまったく同じ形を必要としたため、
 * 用途を引数にして1か所にまとめた。ここは用途を固定して渡すだけの薄い層で、
 * 名前を残しているのは呼び出し側が「何のコードか」を取り違えないため。
 *
 * ⚠️ **複製に戻さないこと。** 以前はこのファイルが独自に実装しており、
 * #1284 で直したはずの read-then-write（`attempts: row.attempts + 1`）が
 * ここにだけ残っていた。同じ名前の2つの実装が逆のことをしている状態は、
 * 片方を直してももう片方が腐る。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { ACCOUNT_DELETE_OTP_ACTION } from '@/constants/accountDeleteCode';
import {
  SEND_USER_BOUND_OTP_RESULT,
  USER_BOUND_OTP_VERIFY_RESULT,
  consumeUserBoundOtp,
  sendUserBoundOtp,
} from '@/lib/auth/userBoundOtp';

/**
 * 送信の結果
 *
 * ⚠️ 値は `SEND_USER_BOUND_OTP_RESULT` と同一。別物にすると呼び出し側の
 * 比較が静かに外れる
 */
export const SEND_ACCOUNT_DELETE_CODE_RESULT = SEND_USER_BOUND_OTP_RESULT;

export type SendAccountDeleteCodeResult =
  (typeof SEND_ACCOUNT_DELETE_CODE_RESULT)[keyof typeof SEND_ACCOUNT_DELETE_CODE_RESULT];

/** 検証の結果 */
export const ACCOUNT_DELETE_VERIFY_RESULT = USER_BOUND_OTP_VERIFY_RESULT;

export type AccountDeleteVerifyResult =
  (typeof ACCOUNT_DELETE_VERIFY_RESULT)[keyof typeof ACCOUNT_DELETE_VERIFY_RESULT];

/**
 * 登録アドレスへ確認コードを送る
 *
 * ⚠️ **宛先は呼び出し側が DB から引いた値**。ボディの値を渡してはいけない。
 * 渡すと、アカウントを1つ持つだけで任意のアドレスへ自サービス名義の
 * 「退会の確認コード」を送れる（#641）。
 *
 * ⚠️ 送信枠（`ACCOUNT_DELETE_CODE_SEND`）はここで数えない。呼び出し側の
 * ルートが認証の直後に原則どおり消費する（`.claude/rules/api-route.md`
 * 「例外2 を選べるのは」／#1359 のレビュー）。
 *
 * @param supabase - service_role のクライアント
 * @param userId - セッションの利用者ID
 * @param email - `users.email` から引いた登録アドレス
 * @returns 送信の結果
 */
export async function sendAccountDeleteCode(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<SendAccountDeleteCodeResult> {
  return sendUserBoundOtp(supabase, userId, email, ACCOUNT_DELETE_OTP_ACTION);
}

/**
 * 確認コードを消費する
 *
 * ⚠️ 消費は**条件付き DELETE の削除行数**で判定する。先に読んでから消すと、
 * 同じコードを同時に2回投げられたときに両方とも通る。
 *
 * ⛔ **`userId` を必ず照合条件に含める。** 外すと、攻撃者が自分のアカウントで
 * 取ったコードを奪った被害者のセッションで使えてしまう（#1359 の critical）。
 *
 * @param supabase - service_role のクライアント
 * @param userId - セッションの利用者ID
 * @param email - `users.email` から引いた登録アドレス（ハッシュの塩）
 * @param code - 利用者が入力した6桁のコード
 * @returns 検証結果
 */
export async function consumeAccountDeleteCode(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  code: string,
): Promise<AccountDeleteVerifyResult> {
  return consumeUserBoundOtp(
    supabase,
    userId,
    email,
    ACCOUNT_DELETE_OTP_ACTION,
    code,
  );
}
