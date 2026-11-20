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
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { ACCOUNT_DELETE_OTP_ACTION } from '@/constants/accountDeleteCode';
import { OTP_CONFIG } from '@/constants/otp';
import { toDbError } from '@/lib/auth/dbError';
import { generateOtpCode, hashOtpCode, sendOtpEmail } from '@/lib/otp';
import { normalizeEmail } from '@/utils/email';

/** 送信の結果 */
export const SEND_ACCOUNT_DELETE_CODE_RESULT = {
  SENT: 'sent',
  /** 再送間隔の内側 */
  THROTTLED: 'throttled',
  /** 送信そのものに失敗した */
  SEND_FAILED: 'send_failed',
} as const;

export type SendAccountDeleteCodeResult =
  (typeof SEND_ACCOUNT_DELETE_CODE_RESULT)[keyof typeof SEND_ACCOUNT_DELETE_CODE_RESULT];

/** 検証の結果 */
export const ACCOUNT_DELETE_VERIFY_RESULT = {
  SUCCESS: 'success',
  /** 不一致・期限切れ・試行回数超過。利用者には区別して返さない */
  INVALID: 'invalid',
} as const;

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
  const normalizedEmail = normalizeEmail(email);

  // 再送間隔は**枠の消費より前に**判定する（枠はルート側が消費済み）。
  //
  // ⚠️ 利用者で絞る。宛先だけだと、同じアドレスを狙った別の行と混ざる
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('user_id', userId)
    .eq('action_type', ACCOUNT_DELETE_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ再送間隔が
  // 素通りする。メールボックスへの連投を止める仕組みなので、
  // 効かない窓を作らない（#1164 と同じ理由）
  if (recentError) {
    throw toDbError(recentError, 'read otp_codes for account delete send');
  }

  if (recent) {
    const elapsedSeconds =
      (Date.now() - new Date(recent.created_at).getTime()) / 1000;

    if (elapsedSeconds < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
      return SEND_ACCOUNT_DELETE_CODE_RESULT.THROTTLED;
    }
  }

  const code = generateOtpCode();

  // 前のコードは無効にする。複数生きていると、古いコードでも通ってしまう
  const { error: clearError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('user_id', userId)
    .eq('action_type', ACCOUNT_DELETE_OTP_ACTION);

  if (clearError) {
    throw toDbError(clearError, 'clear previous account delete codes');
  }

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email: normalizedEmail,
    // ⛔ **これが無いと発行者と削除対象の一致を確認できない**（#1359 の critical
    //   と同じ形）。攻撃者が自分のアカウントで取ったコードを、奪った被害者の
    //   セッションで使えてしまう
    user_id: userId,
    code_hash: hashOtpCode(code, normalizedEmail),
    action_type: ACCOUNT_DELETE_OTP_ACTION,
    expires_at: new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    ).toISOString(),
  });

  if (insertError) {
    throw toDbError(insertError, 'insert account delete code');
  }

  const sent = await sendOtpEmail(
    normalizedEmail,
    code,
    ACCOUNT_DELETE_OTP_ACTION,
  );

  if (!sent) {
    // ⚠️ **枠は戻さない。行だけ消す。**
    //
    //   `.claude/rules/api-route.md`「失敗したとき、歯止めを全部手放さない」。
    //   行を残すと、届いていないコードの行が根拠になって次の試行が
    //   再送間隔に当たる（#1285 で直した誤解そのもの）。代わりに枠を数える
    //   —— 失敗した送信も外部APIを1回消費しているので実態に合う。
    //   残る歯止めは `ACCOUNT_DELETE_CODE_SEND`（5回/60分）。
    await supabase
      .from('otp_codes')
      .delete()
      .eq('user_id', userId)
      .eq('action_type', ACCOUNT_DELETE_OTP_ACTION);

    return SEND_ACCOUNT_DELETE_CODE_RESULT.SEND_FAILED;
  }

  return SEND_ACCOUNT_DELETE_CODE_RESULT.SENT;
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
  const normalizedEmail = normalizeEmail(email);

  // 試行回数を先に見る。上限に達していたら照合せずに弾く。
  // 素の UPDATE で加算すると6回目に chk_otp_attempts で 23514 になり、
  // エラーを見ないと静かにカウントが止まる
  const { data: row, error: rowError } = await supabase
    .from('otp_codes')
    .select('id, attempts')
    .eq('user_id', userId)
    .eq('action_type', ACCOUNT_DELETE_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rowError) throw toDbError(rowError, 'read otp_codes for account delete');

  if (!row) return ACCOUNT_DELETE_VERIFY_RESULT.INVALID;

  if (row.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    return ACCOUNT_DELETE_VERIFY_RESULT.INVALID;
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('user_id', userId)
    .eq('action_type', ACCOUNT_DELETE_OTP_ACTION)
    .eq('code_hash', hashOtpCode(code.trim(), normalizedEmail))
    .gt('expires_at', new Date().toISOString())
    .select('id');

  if (deleteError) {
    throw toDbError(deleteError, 'consume otp_codes for account delete');
  }

  if (!deleted || deleted.length === 0) {
    // 不一致・期限切れのどちらでも加算する。
    // 利用者には区別して返さないので、区別して数える意味もない
    await supabase
      .from('otp_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);

    return ACCOUNT_DELETE_VERIFY_RESULT.INVALID;
  }

  return ACCOUNT_DELETE_VERIFY_RESULT.SUCCESS;
}
