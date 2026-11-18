/**
 * パスワードリセットトークン
 *
 * メールのリンクに載せるワンタイムトークンを扱う。
 *
 * - 平文トークンはメールにだけ載せ、DBには SHA-256 ハッシュのみ保存する
 * - 照合はハッシュ値での検索（インデックス一致）で行う。256bit の乱数由来のため
 *   総当たりは成立せず、bcrypt のようなストレッチは不要
 * - 発行・検証・消費を1か所にまとめ、呼び出し側が手順を間違えられないようにする
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { PASSWORD_RESET_CONFIG } from '@/constants/passwordReset';
import {
  generateVerificationToken,
  hashVerificationToken,
} from '@/lib/otp/verificationToken';

/**
 * リセットトークンを発行し、保存する
 *
 * 同一ユーザーの未使用トークンは先に無効化する。複数のリンクが同時に生きていると、
 * 古いメールを拾った第三者にも窓が残る。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー
 * @param expiryMinutes - 有効期限（分）。既定は利用者自身のリセット向けの値。
 *   admin がアカウントを発行する経路は、受け取る相手が気づくまでの時間を
 *   見込んで長めに取る（`ADMIN_ACCOUNT_CONFIG`）
 * @returns メールに載せる平文トークン
 */
export async function issuePasswordResetToken(
  supabase: SupabaseClient,
  userId: string,
  expiryMinutes: number = PASSWORD_RESET_CONFIG.EXPIRY_MINUTES,
): Promise<string> {
  const { token, tokenHash } = generateVerificationToken();

  // 以前のリンクを生かしておく理由がない
  await supabase
    .from('password_reset_tokens')
    .delete()
    .eq('user_id', userId)
    .is('used_at', null);

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const { error } = await supabase.from('password_reset_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw error;
  }

  return token;
}

/**
 * トークンの消費結果
 *
 * 消費できなかった理由まで返す。画面の文言を出し分けるため（#1232）。
 * 実際に「設定を終えた人がリンクを開き直して『有効期限が切れています』と
 * 言われる」事故が起きた
 */
export type ConsumePasswordResetTokenResult =
  | { status: 'consumed'; userId: string }
  | { status: 'used' }
  | { status: 'expired' }
  | { status: 'invalid' };

/**
 * トークンを検証して消費する
 *
 * 「未使用かつ期限内のときだけ使用済みにする」を条件付きUPDATEの更新行数で
 * 判定する。先に読んでから書くと、同じリンクを同時に2回開かれたときに
 * 両方とも通ってしまう。
 *
 * 0行だった理由は**そのあとで**引き直す。UPDATE の条件を緩めて理由を得る
 * 作りにすると原子性が壊れるため、判定はあくまで更新行数で行う。
 *
 * @param supabase - service_role のクライアント
 * @param token - メールのリンクに載っていた平文トークン
 * @returns 消費できたらユーザーID付き。できなければその理由
 */
export async function consumePasswordResetToken(
  supabase: SupabaseClient,
  token: string,
): Promise<ConsumePasswordResetTokenResult> {
  const tokenHash = hashVerificationToken(token);

  const { data, error } = await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id');

  // ⚠️ error を捨てると `data: null` → 理由の引き直しに落ち、行が無いので
  // `invalid` に化ける。呼び出し側は「リンクが無効」（400）を返し、本当に
  // 無効なトークンと区別がつかない。利用者はリセットの再申請へ誘導される。
  // 投げて 500 にする（#1167）。この経路では UPDATE 自体が失敗している＝
  // トークンは焼かれていないので、再試行は成功しうる
  if (error) {
    throw error;
  }

  if (data && data.length > 0) {
    return { status: 'consumed', userId: data[0].user_id as string };
  }

  return resolveConsumeFailure(supabase, tokenHash);
}

/**
 * 消費できなかった理由を引き直す
 *
 * ⚠️ 読み取りの失敗を `invalid` に化かさない。上と同じ理由で投げる。
 *
 * @param supabase - service_role のクライアント
 * @param tokenHash - 照合に使ったハッシュ
 * @returns `used` / `expired` / `invalid`
 */
async function resolveConsumeFailure(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<ConsumePasswordResetTokenResult> {
  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('used_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw error;
  }

  // 行が無い＝そもそも存在しないトークン。掃除で消えた場合もここに来るが、
  // 利用者にとっては「使えないリンク」で同じ
  if (!data) {
    return { status: 'invalid' };
  }

  // 使用済みを先に見る。両方に当てはまる（使ったあと期限も切れた）ときは、
  // 「期限切れ」より「使用済み」のほうが次にすること（ログイン）が分かる
  if (data.used_at) {
    return { status: 'used' };
  }

  if (new Date(data.expires_at as string).getTime() <= Date.now()) {
    return { status: 'expired' };
  }

  // 未使用で期限内なのに UPDATE が0行＝この一瞬で別のリクエストが消費した。
  // 同じリンクを同時に2回開いた場合。相手が使い切ったので使用済み扱いでよい
  return { status: 'used' };
}

/**
 * トークンが使える状態かを確認する（消費はしない）
 *
 * 新しいパスワードを入力させる画面を開いた時点で、期限切れのリンクを
 * 使い続けさせないための事前確認に使う。
 *
 * @param supabase - service_role のクライアント
 * @param token - 平文トークン
 * @returns 使えるなら true
 */
export async function isPasswordResetTokenValid(
  supabase: SupabaseClient,
  token: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('id')
    .eq('token_hash', hashVerificationToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  // 上の `consumePasswordResetToken` と同じ理由（#1167）。
  // ⚠️ この関数は現時点でどこからも呼ばれていないが、罠を残すと
  // 新しい呼び出し側が同じ誤りを引き継ぐので揃えておく
  if (error) {
    throw error;
  }

  return Boolean(data);
}
