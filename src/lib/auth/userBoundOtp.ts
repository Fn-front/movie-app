/**
 * 利用者に紐づく確認コード（登録アドレス宛）
 *
 * 退会（#1362）と二段階認証の設定（#1368）が同じ形を使う。どちらも
 *
 *   - 宛先は**利用者の登録アドレス**（呼び出し側が `users` から引いた値）
 *   - 照合条件に **`user_id` を必ず含める**
 *   - 公開ルート（`/api/auth/otp/send`）からは到達しない
 *
 * という性質を持つ。
 *
 * ⛔ **`OTP_ACTION`（公開ルートが受け付ける用途）に用途を足さない。**
 * 足すと `/api/auth/otp/send` が受理する。あちらの分岐は宛先をセッションに
 * 固定する処理を `password_change` のときしか行わないため、**未認証のまま
 * 任意のアドレスへ自サービス名義の確認コードを送れる**（#641 / #1261）。
 *
 * ⚠️ **用途ごとに `action` を分ける。** 件名・本文は用途から引くので、
 * 流用すると受信者が「何のためのコードか」を判断できなくなる（#648）。
 *
 * ⚠️ メールアドレス**変更**（`emailChange.ts`）はここに寄せていない。
 * あちらは宛先が「まだ本人のものでないアドレス」で、再送間隔も宛先ごとに
 * 見る必要があるため条件が違う。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AccountDeleteOtpAction } from '@/constants/accountDeleteCode';
import { OTP_CONFIG } from '@/constants/otp';
import type { SecondFactorSetupOtpAction } from '@/constants/secondFactorSetupCode';
import { toDbError } from '@/lib/auth/dbError';
import { incrementOtpAttempts } from '@/lib/auth/otpAttempts';
import { generateOtpCode, hashOtpCode, sendOtpEmail } from '@/lib/otp';
import { normalizeEmail } from '@/utils/email';

/**
 * ここで扱える用途
 *
 * ⛔ 広げるときは「宛先が登録アドレスであること」を必ず確かめる。
 * 宛先が変わる用途を混ぜると、再送間隔の判定が宛先をまたいでしまう。
 */
export type UserBoundOtpAction =
  | AccountDeleteOtpAction
  | SecondFactorSetupOtpAction;

/** 送信の結果 */
export const SEND_USER_BOUND_OTP_RESULT = {
  SENT: 'sent',
  /** 再送間隔の内側 */
  THROTTLED: 'throttled',
  /** 送信そのものに失敗した */
  SEND_FAILED: 'send_failed',
} as const;

export type SendUserBoundOtpResult =
  (typeof SEND_USER_BOUND_OTP_RESULT)[keyof typeof SEND_USER_BOUND_OTP_RESULT];

/** 検証の結果 */
export const USER_BOUND_OTP_VERIFY_RESULT = {
  SUCCESS: 'success',
  /** 不一致・期限切れ・試行回数超過。利用者には区別して返さない */
  INVALID: 'invalid',
} as const;

export type UserBoundOtpVerifyResult =
  (typeof USER_BOUND_OTP_VERIFY_RESULT)[keyof typeof USER_BOUND_OTP_VERIFY_RESULT];

/**
 * 登録アドレスへ確認コードを送る
 *
 * ⚠️ **宛先は呼び出し側が DB から引いた値**。ボディの値を渡してはいけない。
 * 渡すと、アカウントを1つ持つだけで任意のアドレスへ自サービス名義の
 * コードを送れる（#641）。
 *
 * ⚠️ 送信枠はここで数えない。呼び出し側のルートが認証の直後に原則どおり
 * 消費する（`.claude/rules/api-route.md`「例外2 を選べるのは」／#1359）。
 *
 * @param supabase - service_role のクライアント
 * @param userId - セッションの利用者ID
 * @param email - `users.email` から引いた登録アドレス
 * @param action - 用途（件名・本文の出し分けに使う）
 * @returns 送信の結果
 */
export async function sendUserBoundOtp(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  action: UserBoundOtpAction,
): Promise<SendUserBoundOtpResult> {
  const normalizedEmail = normalizeEmail(email);

  // 再送間隔は**枠の消費より前に**判定する（枠はルート側が消費済み）。
  //
  // ⚠️ 利用者と用途で絞る。宛先だけだと別の用途の送信で弾かれる
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('user_id', userId)
    .eq('action_type', action)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ再送間隔が
  // 素通りする。メールボックスへの連投を止める仕組みなので、
  // 効かない窓を作らない（#1164 と同じ理由）
  if (recentError) {
    throw toDbError(recentError, `read otp_codes for ${action} send`);
  }

  if (recent) {
    const elapsedSeconds =
      (Date.now() - new Date(recent.created_at).getTime()) / 1000;

    if (elapsedSeconds < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
      return SEND_USER_BOUND_OTP_RESULT.THROTTLED;
    }
  }

  const code = generateOtpCode();

  // 前のコードは無効にする。複数生きていると、古いコードでも通ってしまう
  const { error: clearError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('user_id', userId)
    .eq('action_type', action);

  if (clearError) {
    throw toDbError(clearError, `clear previous ${action} codes`);
  }

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email: normalizedEmail,
    // ⛔ **これが無いと発行者と対象の一致を確認できない**（#1359 の critical）。
    //   攻撃者が自分のアカウントで取ったコードを、奪った被害者のセッションで
    //   使えてしまう
    user_id: userId,
    code_hash: hashOtpCode(code, normalizedEmail),
    action_type: action,
    expires_at: new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    ).toISOString(),
  });

  if (insertError) {
    throw toDbError(insertError, `insert ${action} code`);
  }

  const sent = await sendOtpEmail(normalizedEmail, code, action);

  if (!sent) {
    // ⚠️ **枠は戻さない。行だけ消す。**
    //
    //   `.claude/rules/api-route.md`「失敗したとき、歯止めを全部手放さない」。
    //   行を残すと、届いていないコードの行が根拠になって次の試行が
    //   再送間隔に当たる（#1285 で直した誤解そのもの）。代わりに枠を数える
    //   —— 失敗した送信も外部APIを1回消費しているので実態に合う。
    await supabase
      .from('otp_codes')
      .delete()
      .eq('user_id', userId)
      .eq('action_type', action);

    return SEND_USER_BOUND_OTP_RESULT.SEND_FAILED;
  }

  return SEND_USER_BOUND_OTP_RESULT.SENT;
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
 * @param action - 用途
 * @param code - 利用者が入力した6桁のコード
 * @returns 検証結果
 */
export async function consumeUserBoundOtp(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  action: UserBoundOtpAction,
  code: string,
): Promise<UserBoundOtpVerifyResult> {
  const normalizedEmail = normalizeEmail(email);

  // 試行回数を先に見る。上限に達していたら照合せずに弾く。
  //
  // ⚠️ 上限に達していたら**照合せずに**弾く。到達後も照合を続けると、
  //    攻撃者は上限の有無に関係なく総当たりを続けられる
  const { data: row, error: rowError } = await supabase
    .from('otp_codes')
    .select('id, attempts')
    .eq('user_id', userId)
    .eq('action_type', action)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rowError) throw toDbError(rowError, `read otp_codes for ${action}`);

  if (!row) return USER_BOUND_OTP_VERIFY_RESULT.INVALID;

  if (row.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    return USER_BOUND_OTP_VERIFY_RESULT.INVALID;
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('user_id', userId)
    .eq('action_type', action)
    .eq('code_hash', hashOtpCode(code.trim(), normalizedEmail))
    .gt('expires_at', new Date().toISOString())
    .select('id');

  if (deleteError) {
    throw toDbError(deleteError, `consume otp_codes for ${action}`);
  }

  if (!deleted || deleted.length === 0) {
    // 不一致・期限切れのどちらでも加算する。
    // 利用者には区別して返さないので、区別して数える意味もない。
    //
    // ⛔ **read-then-write で書き戻さない**（#1284）
    await incrementOtpAttempts(supabase, row.id);

    return USER_BOUND_OTP_VERIFY_RESULT.INVALID;
  }

  return USER_BOUND_OTP_VERIFY_RESULT.SUCCESS;
}
