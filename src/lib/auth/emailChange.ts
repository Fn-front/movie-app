/**
 * メールアドレス変更の確認コード（#1359）
 *
 * ⛔ **この用途のコードはここからしか作らない。**
 *
 * `OTP_ACTION`（公開ルートが受け付ける用途）に入れると
 * `/api/auth/otp/send` が受理する。あちらの分岐は宛先をセッションに固定する
 * 処理を `password_change` のときしか行わないため、**未認証のまま任意の
 * アドレスへ自サービス名義の確認コードを送れる**状態になる（#641 / #1261）。
 *
 * とくにこの用途は**宛先がまだ本人のものでないアドレス**なので、
 * 公開されたときの被害が第2要素より大きい。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { EMAIL_CHANGE_OTP_ACTION } from '@/constants/emailChange';
import { OTP_CONFIG } from '@/constants/otp';
import { RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants/rateLimit';
import { toDbError } from '@/lib/auth/dbError';
import { generateOtpCode, hashOtpCode, sendOtpEmail } from '@/lib/otp';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { normalizeEmail } from '@/utils/email';

/** 送信の結果 */
export const SEND_EMAIL_CHANGE_RESULT = {
  SENT: 'sent',
  /** 再送間隔の内側 */
  THROTTLED: 'throttled',
  /** 送信枠を使い切った */
  LIMIT_EXCEEDED: 'limit_exceeded',
  /** 送信そのものに失敗した */
  SEND_FAILED: 'send_failed',
} as const;

export type SendEmailChangeResult =
  (typeof SEND_EMAIL_CHANGE_RESULT)[keyof typeof SEND_EMAIL_CHANGE_RESULT];

/** 検証の結果 */
export const EMAIL_CHANGE_VERIFY_RESULT = {
  SUCCESS: 'success',
  /** 不一致・期限切れ・試行回数超過。利用者には区別して返さない */
  INVALID: 'invalid',
} as const;

export type EmailChangeVerifyResult =
  (typeof EMAIL_CHANGE_VERIFY_RESULT)[keyof typeof EMAIL_CHANGE_VERIFY_RESULT];

/**
 * 新しいアドレスへ確認コードを送る
 *
 * ⚠️ **識別子はセッションの利用者ID。** 新しいアドレスで数えると、
 * 宛先を変えるだけでカウンタが分かれて送信数を掛け算できる（#641 / #644）。
 *
 * @param supabase - service_role のクライアント
 * @param userId - セッションの利用者ID
 * @param newEmail - 送信先。検証済みの値のみ
 * @returns 送信の結果
 */
export async function sendEmailChangeCode(
  supabase: SupabaseClient,
  userId: string,
  newEmail: string,
): Promise<SendEmailChangeResult> {
  const normalizedEmail = normalizeEmail(newEmail);

  // 再送間隔は**枠の消費より前に**判定する。ここで枠を消費すると、
  // ボタンの二度押しだけで上限に達して1時間変更できなくなる
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('email', normalizedEmail)
    .eq('action_type', EMAIL_CHANGE_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ再送間隔が
  // 素通りする。メールボックスへの連投を止める仕組みなので、
  // 効かない窓を作らない（#1164 と同じ理由）
  if (recentError) {
    throw toDbError(recentError, 'read otp_codes for email change send');
  }

  if (recent) {
    const elapsedSeconds =
      (Date.now() - new Date(recent.created_at).getTime()) / 1000;

    if (elapsedSeconds < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
      return SEND_EMAIL_CHANGE_RESULT.THROTTLED;
    }
  }

  // ここから先は実際に送る。枠を消費する
  // （`.claude/rules/api-route.md` の例外2 — 守る資源はメールボックス）
  const limitResult = await checkRateLimit(
    supabase,
    userId,
    RATE_LIMIT_ACTION.EMAIL_CHANGE_REQUEST,
    RATE_LIMIT_CONFIG.EMAIL_CHANGE_REQUEST.maxAttempts,
    RATE_LIMIT_CONFIG.EMAIL_CHANGE_REQUEST.windowMinutes,
  );

  if (!limitResult.allowed) {
    return SEND_EMAIL_CHANGE_RESULT.LIMIT_EXCEEDED;
  }

  const code = generateOtpCode();

  // 前のコードは無効にする。複数生きていると、古いコードでも通ってしまう
  const { error: clearError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('email', normalizedEmail)
    .eq('action_type', EMAIL_CHANGE_OTP_ACTION);

  if (clearError) {
    throw toDbError(clearError, 'clear previous email change codes');
  }

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email: normalizedEmail,
    code_hash: hashOtpCode(code, normalizedEmail),
    action_type: EMAIL_CHANGE_OTP_ACTION,
    expires_at: new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    ).toISOString(),
  });

  if (insertError) {
    throw toDbError(insertError, 'insert email change code');
  }

  const sent = await sendOtpEmail(
    normalizedEmail,
    code,
    EMAIL_CHANGE_OTP_ACTION,
  );

  if (!sent) {
    // ⚠️ **枠は戻さない。行だけ消す。**
    //
    //   `.claude/rules/api-route.md`「失敗したとき、歯止めを全部手放さない」。
    //   行を残すと、届いていないコードの行が根拠になって次の試行が
    //   再送間隔に当たる（#1285 で直した誤解そのもの）。代わりに枠を数える
    //   —— 失敗した送信も外部APIを1回消費しているので実態に合う。
    //   残る歯止めは `EMAIL_CHANGE_REQUEST`（5回/60分）。
    await supabase
      .from('otp_codes')
      .delete()
      .eq('email', normalizedEmail)
      .eq('action_type', EMAIL_CHANGE_OTP_ACTION);

    return SEND_EMAIL_CHANGE_RESULT.SEND_FAILED;
  }

  return SEND_EMAIL_CHANGE_RESULT.SENT;
}

/**
 * 確認コードを消費する
 *
 * ⚠️ 消費は**条件付き DELETE の削除行数**で判定する。先に読んでから消すと、
 * 同じコードを同時に2回投げられたときに両方とも通る。
 *
 * @param supabase - service_role のクライアント
 * @param newEmail - 送信先。検証済みの値のみ
 * @param code - 利用者が入力した6桁のコード
 * @returns 検証結果
 */
export async function consumeEmailChangeCode(
  supabase: SupabaseClient,
  newEmail: string,
  code: string,
): Promise<EmailChangeVerifyResult> {
  const normalizedEmail = normalizeEmail(newEmail);

  // 試行回数を先に見る。上限に達していたら照合せずに弾く。
  // 素の UPDATE で加算すると6回目に chk_otp_attempts で 23514 になり、
  // エラーを見ないと静かにカウントが止まる
  const { data: row, error: rowError } = await supabase
    .from('otp_codes')
    .select('id, attempts')
    .eq('email', normalizedEmail)
    .eq('action_type', EMAIL_CHANGE_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rowError) throw toDbError(rowError, 'read otp_codes for email change');

  if (!row) return EMAIL_CHANGE_VERIFY_RESULT.INVALID;

  if (row.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    return EMAIL_CHANGE_VERIFY_RESULT.INVALID;
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('otp_codes')
    .delete()
    .eq('email', normalizedEmail)
    .eq('action_type', EMAIL_CHANGE_OTP_ACTION)
    .eq('code_hash', hashOtpCode(code.trim(), normalizedEmail))
    .gt('expires_at', new Date().toISOString())
    .select('id');

  if (deleteError) {
    throw toDbError(deleteError, 'consume otp_codes for email change');
  }

  if (!deleted || deleted.length === 0) {
    // 不一致・期限切れのどちらでも加算する。
    // 利用者には区別して返さないので、区別して数える意味もない
    await supabase
      .from('otp_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);

    return EMAIL_CHANGE_VERIFY_RESULT.INVALID;
  }

  return EMAIL_CHANGE_VERIFY_RESULT.SUCCESS;
}
