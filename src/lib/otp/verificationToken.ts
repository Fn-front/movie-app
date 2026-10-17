/**
 * OTP検証済みトークンのユーティリティ
 *
 * OTPコードの照合に成功したクライアントへ発行するワンタイムトークンを扱う。
 *
 * 「OTP検証が済んでいる」ことの証明は、メールアドレスのような公開識別子ではなく
 * このトークンで行う。メールアドレスを証明に使うと、被害者が検証を終えた直後に
 * 第三者が `signIn` を叩くだけでログインできてしまうため。
 *
 * - 平文トークンはレスポンスで一度だけ返し、DBには SHA-256 ハッシュのみ保存する
 * - 照合はハッシュ値での検索（インデックス一致）で行う。256bit の乱数由来のため
 *   総当たりは成立せず、トークンを持たない第三者は該当行を特定できない
 */

import { randomBytes, createHash } from 'crypto';

/** トークンのバイト長（256bit） */
const TOKEN_BYTES = 32;

/**
 * 検証済みトークンを生成する
 *
 * @returns 平文トークン（クライアントへ返す）とそのハッシュ（DBへ保存する）
 */
export function generateVerificationToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  return { token, tokenHash: hashVerificationToken(token) };
}

/**
 * 検証済みトークンをハッシュ化する
 *
 * OTPコードと違い 256bit の乱数なので、総当たり耐性のためのストレッチ（bcrypt 等）は
 * 不要。DB漏洩時に平文トークンを復元させないことが目的のため SHA-256 で足りる。
 *
 * @param token - 平文トークン
 * @returns SHA-256 ハッシュ（hex）
 */
export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
