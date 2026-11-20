/**
 * 確認コードの試行回数の加算（#1284）
 *
 * ⛔ **read-then-write では同時実行で加算が失われる。**
 *
 * ```ts
 * const { data: row } = await supabase.from('otp_codes').select('attempts')...
 * await supabase.from('otp_codes').update({ attempts: row.attempts + 1 })...
 * ```
 *
 * N 並列で誤ったコードを投げると、全員が同じ `attempts` を読んで同じ値を
 * 書き戻すため、**0→1 が N 回**起きるだけで済む。`otp_codes.attempts` の
 * 5回上限が設計意図どおりに機能しない。
 *
 * ⚠️ **直ちに総当たりが成立するわけではない。** 到達点はすべて上位の
 * 原子的なレート制限（`consume_rate_limit` RPC）が止める。それでも
 * 「多層防御の1枚」として足したものが効いていない状態は、次の読み手が
 * 効いていると誤解するため直す。
 *
 * ⚠️ PostgREST から `attempts = attempts + 1` という式は書けないので RPC を使う。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { OTP_CONFIG } from '@/constants/otp';

/**
 * `otp_codes.attempts` を原子的に1つ増やす
 *
 * ⚠️ 戻り値は**加算後**の値。`auth/otp/verify` は「この回で上限に達したか」で
 * 文言と導線を出し分けている（#1248）。読み直すと、そこでまた競合する。
 *
 * ⚠️ **投げない。** 呼ぶのは「コードが一致しなかった」と確定した後で、
 * 利用者へ返す結果はもう決まっている。ここで例外を漏らすと、**不一致なのに
 * 500**になって理由が伝わらない。数えられなかったことはログに残す。
 *
 * ⚠️ 失敗したときは**上限値**を返す。加算できていない以上「あと何回試せるか」
 * は分からないので、緩い側（0回）ではなく厳しい側へ倒す。
 *
 * ⚠️ **ただし戻り値を使うのは `auth/otp/verify` だけ。** そこで厳しい側へ
 * 倒れるのは**文言**（429「上限に達しました」）であって、カウンタそのものは
 * 増えていない。次のリクエストは入口の判定を通るので**締め出しは起きない**
 * 代わりに、5回上限の保護は上位の原子的なレート制限に委ねられる。
 * `secondFactor` / `emailChange` は戻り値を捨てる。
 *
 * @param supabase - service_role のクライアント
 * @param id - `otp_codes.id`
 * @returns 加算後の試行回数（失敗時は上限値）
 */
export async function incrementOtpAttempts(
  supabase: SupabaseClient,
  id: string,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('increment_otp_attempts', {
      p_id: id,
    });

    if (error) {
      console.error(
        `[otpAttempts] 試行回数を加算できませんでした id='${id}'`,
        error,
      );

      return OTP_CONFIG.MAX_ATTEMPTS;
    }

    return typeof data === 'number' ? data : OTP_CONFIG.MAX_ATTEMPTS;
  } catch (error) {
    console.error(
      `[otpAttempts] 試行回数を加算できませんでした id='${id}'`,
      error,
    );

    return OTP_CONFIG.MAX_ATTEMPTS;
  }
}
