/**
 * E2Eテスト用 TOTP ヘルパー
 *
 * 認証アプリの代わりに、その時点の6桁コードを計算する。
 *
 * 共有鍵は DB に暗号化して保存されているため、アプリと同じ手順
 * （`TOTP_ENCRYPTION_KEY` から HKDF で鍵を導出 → AES-256-GCM で復号）で
 * 取り出す。テスト用の抜け道を製品コード側に作らないための方針で、
 * OTPコードの総当たり（`findOtpCodeByHash`）と同じ考え方。
 */

import { createDecipheriv, createHmac, hkdfSync } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

/**
 * 鍵の用途。
 * `src/lib/totp/keys.ts` の `KEY_PURPOSE` と一致させること。
 */
const KEY_PURPOSE = {
  SECRET_ENCRYPTION: 'movie-app:totp-secret-encryption:v1',
  RECOVERY_CODE_HMAC: 'movie-app:totp-recovery-code-hmac:v1',
} as const;

/** RFC 4648 の標準アルファベット */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * マスター鍵から用途別の鍵を導出する
 *
 * @param purpose - 鍵の用途
 * @returns 32バイトの鍵
 */
function deriveKey(purpose: string): Buffer {
  const masterKey = process.env.TOTP_ENCRYPTION_KEY;

  if (!masterKey) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY が未設定のため、共有鍵を復号できません。' +
        'E2E実行環境に本番と同じ値を設定してください。',
    );
  }

  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(masterKey, 'base64'),
      Buffer.alloc(0),
      purpose,
      32,
    ),
  );
}

/**
 * base32 をデコードする
 *
 * @param encoded - base32 文字列
 * @returns バイト列
 */
function base32Decode(encoded: string): Buffer {
  const map = new Map([...BASE32_ALPHABET].map((char, i) => [char, i]));
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of encoded.toUpperCase().replace(/[=\s]/g, '')) {
    value = (value << 5) | map.get(char)!;
    bits += 5;

    while (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * 保存されている暗号文から共有鍵を取り出す
 *
 * @param encryptedSecret - `iv:authTag:暗号文`（base64）
 * @returns base32 の共有鍵
 */
function decryptSecret(encryptedSecret: string): string {
  const [iv, authTag, encrypted] = encryptedSecret.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(KEY_PURPOSE.SECRET_ENCRYPTION),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * 共有鍵から指定時刻のコードを計算する（RFC 6238）
 *
 * @param secretBase32 - base32 の共有鍵
 * @param atMs - 基準時刻（ミリ秒）
 * @returns 6桁のコード
 */
export function totpCodeFromSecret(
  secretBase32: string,
  atMs: number = Date.now(),
): string {
  const counter = Math.floor(atMs / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', base32Decode(secretBase32))
    .update(counterBytes)
    .digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** 6).padStart(6, '0');
}

/**
 * ユーザーIDを取得する
 *
 * @param email - メールアドレス
 * @returns ユーザーID。存在しなければ null
 */
async function getUserId(email: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`,
    { headers: supabaseHeaders },
  );
  const data = await res.json();

  return data[0]?.id ?? null;
}

/**
 * 設定中・設定済みの共有鍵を取り出す
 *
 * 設定画面がQRを出した直後（`confirmed_at` が NULL）でも取れる。
 * 認証アプリでQRを読み取る操作の代わりになる。
 *
 * @param email - 対象ユーザーのメールアドレス
 * @returns base32 の共有鍵。無ければ null
 */
export async function getTotpSecret(email: string): Promise<string | null> {
  const userId = await getUserId(email);
  if (!userId) return null;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_totp?user_id=eq.${userId}&select=encrypted_secret`,
    { headers: supabaseHeaders },
  );
  const data = await res.json();
  const encryptedSecret: string | undefined = data[0]?.encrypted_secret;

  return encryptedSecret ? decryptSecret(encryptedSecret) : null;
}

/**
 * その時点の認証コードを取得する
 *
 * @param email - 対象ユーザーのメールアドレス
 * @returns 6桁のコード。共有鍵が無ければ null
 */
export async function getCurrentTotpCode(
  email: string,
): Promise<string | null> {
  const secret = await getTotpSecret(email);

  return secret ? totpCodeFromSecret(secret) : null;
}

/**
 * リカバリーコードの平文が、保存されているハッシュと対応するか確認する
 *
 * 画面に表示された平文が本物か（＝実際にログインに使えるか）を、
 * ログインを試す前に判定するために使う。
 *
 * @param email - 対象ユーザーのメールアドレス
 * @param code - 画面に表示された平文
 * @returns 未使用のコードとして存在すれば true
 */
export async function isRecoveryCodeStored(
  email: string,
  code: string,
): Promise<boolean> {
  const userId = await getUserId(email);
  if (!userId) return false;

  const hash = createHmac('sha256', deriveKey(KEY_PURPOSE.RECOVERY_CODE_HMAC))
    .update(code.toUpperCase().replace(/[-\s]/g, ''))
    .digest('hex');

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/totp_recovery_codes` +
      `?user_id=eq.${userId}&code_hash=eq.${hash}&used_at=is.null&select=id`,
    { headers: supabaseHeaders },
  );
  const data = await res.json();

  return data.length > 0;
}

/**
 * テストユーザーの二段階認証設定を消す
 *
 * 有効なまま次のテストに入ると、他の認証テストがログインできなくなる。
 *
 * @param email - 対象ユーザーのメールアドレス
 */
export async function cleanupTotp(email: string): Promise<void> {
  const userId = await getUserId(email);
  if (!userId) return;

  await fetch(
    `${SUPABASE_URL}/rest/v1/totp_recovery_codes?user_id=eq.${userId}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
  await fetch(`${SUPABASE_URL}/rest/v1/user_totp?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}
