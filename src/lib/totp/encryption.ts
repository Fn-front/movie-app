/**
 * TOTP 共有鍵の保存時暗号化（AES-256-GCM）
 *
 * TOTP の共有鍵はハッシュ化できない。検証のたびに鍵そのものが必要になるため、
 * 復号可能な形で保存するしかない。そのぶん DB が漏れた時点で二段階認証が
 * 突破されないよう、鍵はアプリ側の暗号鍵（`TOTP_ENCRYPTION_KEY`）で暗号化して
 * 保存する。DB と環境変数の両方を取られない限り復号できない。
 *
 * GCM を選ぶのは認証付き暗号だから。CBC 等だと暗号文を書き換えられても
 * 復号が通ってしまい、DB への書き込み権限を持つ攻撃者に任意の鍵へ
 * すり替えられる余地が残る。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { deriveTotpKey, KEY_PURPOSE } from './keys';

/** 暗号化方式 */
const ALGORITHM = 'aes-256-gcm';

/** IV の長さ（GCM の推奨値は96bit） */
const IV_BYTES = 12;

/** 認証タグの長さ */
const AUTH_TAG_BYTES = 16;

/** 暗号文の各要素を連結する際の区切り */
const SEPARATOR = ':';

/**
 * 暗号鍵を取り出す
 *
 * @returns 32バイトの鍵
 */
function getEncryptionKey(): Buffer {
  return deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION);
}

/**
 * TOTP 共有鍵を暗号化する
 *
 * IV は毎回ランダムに生成する。GCM は同じ鍵で IV を使い回すと平文が復元され得るため、
 * 使い回してはいけない。
 *
 * @param plaintext - base32 エンコードされた共有鍵
 * @returns `iv:authTag:暗号文`（いずれも base64）
 */
export function encryptTotpSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(SEPARATOR);
}

/**
 * 暗号化された TOTP 共有鍵を復号する
 *
 * 改ざんされていれば認証タグの検証に失敗し、例外になる。
 *
 * @param ciphertext - `encryptTotpSecret` の出力
 * @returns base32 エンコードされた共有鍵
 * @throws 形式が不正、または改ざんされている場合
 */
export function decryptTotpSecret(ciphertext: string): string {
  const parts = ciphertext.split(SEPARATOR);

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted TOTP secret format');
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  // 長さが違うと createDecipheriv / setAuthTag が別々の例外を投げるため先に揃える
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Invalid encrypted TOTP secret format');
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
