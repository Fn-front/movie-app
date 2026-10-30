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
 * トークンを検証して消費する
 *
 * 「未使用かつ期限内のときだけ使用済みにする」を条件付きUPDATEの更新行数で
 * 判定する。先に読んでから書くと、同じリンクを同時に2回開かれたときに
 * 両方とも通ってしまう。
 *
 * @param supabase - service_role のクライアント
 * @param token - メールのリンクに載っていた平文トークン
 * @returns 対象ユーザーのID。無効・期限切れ・使用済みなら null
 */
export async function consumePasswordResetToken(
  supabase: SupabaseClient,
  token: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hashVerificationToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id');

  if (!data || data.length === 0) {
    return null;
  }

  return data[0].user_id as string;
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
  const { data } = await supabase
    .from('password_reset_tokens')
    .select('id')
    .eq('token_hash', hashVerificationToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  return Boolean(data);
}
