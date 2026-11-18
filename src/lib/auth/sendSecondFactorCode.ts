/**
 * 第2要素のコードを生成してメールで送る
 *
 * **第2要素のコードを作る唯一の場所。** 送信経路は4本あるが、いずれもここを通す。
 *
 *   1. パスワードログイン（`auth.ts` の `authorize`）
 *   2. OAuth ログイン（`auth.ts` の `jwt` コールバック）
 *   3. 設定画面での有効化（`POST /api/user/totp/setup`）
 *   4. 設定変更の本人確認（`POST /api/user/totp/send-challenge`）
 *
 * 1か所に集めているのは、レート制限・再送間隔・失敗時の後始末を
 * 経路ごとに書き分けると必ずどれかが抜けるため。
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { OTP_CONFIG } from '@/constants/otp';
import { RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants/rateLimit';
import { TWO_FACTOR_OTP_ACTION } from '@/constants/secondFactor';
import { generateOtpCode, hashOtpCode, sendOtpEmail } from '@/lib/otp';
import { checkRateLimit, releaseRateLimit } from '@/lib/rateLimit/rateLimit';
import { normalizeEmail } from '@/utils/email';

import { toDbError } from './dbError';

/**
 * 送信の結果
 *
 * ⚠️ `LIMIT_EXCEEDED` を `SENT` と同じ扱いにしてはいけない。1通も送って
 * いないのに「メールを確認してください」と出すと、届かないコードを待たせる
 * ことになる。この状態の出口はリカバリーコードだけなので、呼び出し側は
 * そこへ誘導する。
 */
export const SEND_SECOND_FACTOR_RESULT = {
  /** 送信した */
  SENT: 'sent',
  /** 再送間隔（60秒）内。直前のコードがまだ生きている */
  THROTTLED: 'throttled',
  /** 送信回数の上限。1通も送っていない */
  LIMIT_EXCEEDED: 'limit_exceeded',
  /** 送信そのものが失敗した。打ち直しても直らない */
  SEND_FAILED: 'send_failed',
} as const;

export type SendSecondFactorResult =
  (typeof SEND_SECOND_FACTOR_RESULT)[keyof typeof SEND_SECOND_FACTOR_RESULT];

/**
 * 第2要素のコードを送る
 *
 * ⚠️ **`email` をリクエストボディから渡してはいけない。** 必ずセッション、
 * または `users` テーブルから引いた値を渡すこと。ボディを信用すると、
 * 任意のアドレスへ自サービス名義のコードメールを送れる（#641）。
 *
 * ⚠️ `authorize` から呼ぶときの宛先は `user.email`。`authorize` スコープの
 * `email` ローカル変数はユーザー名ログインで空文字になり、全ユーザー名
 * アカウントが `otp_codes.email = ''` の1行を共有してコードが混線する。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー（レート制限の識別子にも使う）
 * @param email - 送信先。サーバー側で確定した値のみ
 * @returns 送信の結果
 */
export async function sendSecondFactorCode(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<SendSecondFactorResult> {
  const normalizedEmail = normalizeEmail(email);

  // 再送間隔。**枠の消費より前に**判定する。
  // ここで枠を消費すると、ボタンの二度押しだけで上限に達して
  // 1時間ログインできなくなる
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ再送間隔が
  // 素通りする。メールボックスへの連投を止める仕組みなので、
  // 効かない窓を作らない（#1164 と同じ理由）
  if (recentError) {
    throw toDbError(recentError, 'read otp_codes for second factor send');
  }

  if (recent) {
    const elapsedSeconds =
      (Date.now() - new Date(recent.created_at).getTime()) / 1000;

    if (elapsedSeconds < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
      return SEND_SECOND_FACTOR_RESULT.THROTTLED;
    }
  }

  // ここから先は実際に送る。枠を消費する
  // （`.claude/rules/api-route.md` の例外2 — 守る資源はメールボックス）
  //
  // 識別子はユーザーID。メールアドレスにすると、宛先や表記を変えるだけで
  // カウンタが分かれて送信数を掛け算できる（#641 / #644）
  const limitResult = await checkRateLimit(
    supabase,
    userId,
    RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.maxAttempts,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.windowMinutes,
  );

  if (!limitResult.allowed) {
    return SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED;
  }

  const code = generateOtpCode();

  /** 同一宛先の第2要素コードをすべて消す */
  const clearExistingCodes = () =>
    supabase
      .from('otp_codes')
      .delete()
      .eq('email', normalizedEmail)
      .eq('action_type', TWO_FACTOR_OTP_ACTION);

  // 前のコードは無効にする。複数生きていると、古いコードでも通ってしまう
  const { error: clearError } = await clearExistingCodes();

  if (clearError) {
    throw toDbError(clearError, 'clear previous second factor codes');
  }

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email: normalizedEmail,
    code_hash: hashOtpCode(code, normalizedEmail),
    action_type: TWO_FACTOR_OTP_ACTION,
    expires_at: new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    ).toISOString(),
  });

  if (insertError) {
    throw toDbError(insertError, 'insert second factor code');
  }

  const sent = await sendOtpEmail(normalizedEmail, code, TWO_FACTOR_OTP_ACTION);

  if (!sent) {
    // ⚠️ 枠と行の両方を戻す。
    //
    // 現行の `/api/auth/otp/send` は送信失敗でも枠を戻さない（#1260）。
    // 登録確認なら「後で再試行」で済むが、第2要素では**ログインそのものが
    // できなくなる** — 数回の失敗で1時間締め出される。
    //
    // 行も消す。残すと、届いていないコードの再送が再送間隔に阻まれる。
    await releaseRateLimit(supabase, userId, RATE_LIMIT_ACTION.TWO_FACTOR_SEND);
    await clearExistingCodes();

    return SEND_SECOND_FACTOR_RESULT.SEND_FAILED;
  }

  return SEND_SECOND_FACTOR_RESULT.SENT;
}
