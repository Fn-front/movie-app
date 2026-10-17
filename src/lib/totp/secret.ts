/**
 * TOTP 共有鍵の生成と、認証アプリへの受け渡し
 *
 * 鍵そのものが二段階認証の強度を決めるため、生成には CSPRNG（`randomBytes`）を使う。
 * `Math.random` は予測可能で、鍵が推測できれば二段階認証は無意味になる。
 */

import { randomBytes } from 'crypto';

import { TOTP_CONFIG, TOTP_ISSUER } from '@/constants/totp';

import { base32Encode } from './base32';

/**
 * TOTP の共有鍵を生成する
 *
 * @returns base32 エンコードされた共有鍵
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_CONFIG.SECRET_BYTES));
}

/**
 * 認証アプリに読み込ませる `otpauth://` URI を組み立てる
 *
 * QRコードにするのはこの文字列。Key Uri Format（Google Authenticator の事実上の標準）
 * に従う。
 *
 * パラメータを明示するのは、既定値の解釈がアプリによって異なる場合に備えるため。
 *
 * @param secretBase32 - base32 エンコードされた共有鍵
 * @param accountName - 認証アプリ上で表示する識別子（メールアドレス等）
 * @returns `otpauth://totp/...` 形式の URI
 */
export function buildOtpAuthUri(
  secretBase32: string,
  accountName: string,
): string {
  // ラベルは "発行者:アカウント" 形式。`:` は区切りなので各要素側はエスケープする
  const label = `${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(accountName)}`;

  // URLSearchParams は空白を `+` にするが、Key Uri Format の例は `%20`。
  // `+` をそのまま空白と解釈しないアプリがあるため encodeURIComponent で組み立てる
  const params = [
    ['secret', secretBase32],
    ['issuer', TOTP_ISSUER],
    ['algorithm', TOTP_CONFIG.ALGORITHM.toUpperCase()],
    ['digits', String(TOTP_CONFIG.DIGITS)],
    ['period', String(TOTP_CONFIG.STEP_SECONDS)],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `otpauth://totp/${label}?${params}`;
}
