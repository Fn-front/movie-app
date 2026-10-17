/**
 * TOTP（Time-Based One-Time Password / RFC 6238）
 *
 * HOTP（RFC 4226）のカウンタを「現在時刻 / 時間ステップ」に置き換えたもの。
 * 仕様が短く依存を増やす理由が薄いため、Node の crypto で自前実装する
 * （プロジェクト方針: 不要な外部依存を追加しない）。
 *
 * 暗号プリミティブ自体を作っているわけではなく HMAC の組み立て方の問題なので、
 * 正しさは RFC 4226 Appendix D / RFC 6238 Appendix B の公式テストベクタで
 * 担保する（totp.test.ts）。
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { TOTP_CONFIG } from '@/constants/totp';

import { base32Decode } from './base32';

/** 入力コードの形式チェック（HMACを計算する前の足切り用） */
const CODE_PATTERN = new RegExp(`^\\d{${TOTP_CONFIG.DIGITS}}$`);

/**
 * 時刻をカウンタ値（時間ステップ番号）に変換する
 *
 * @param atMs - 基準時刻（ミリ秒）
 * @returns カウンタ値
 */
function toCounter(atMs: number): number {
  return Math.floor(atMs / 1000 / TOTP_CONFIG.STEP_SECONDS);
}

/**
 * HOTP を計算する（RFC 4226 Section 5.3）
 *
 * @param secret - 共有鍵
 * @param counter - カウンタ値
 * @returns ゼロ埋めした数字列
 */
function generateHotp(secret: Buffer, counter: number): string {
  // カウンタを 8 バイトのビッグエンディアンに詰める
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac(TOTP_CONFIG.ALGORITHM, secret)
    .update(counterBytes)
    .digest();

  // 動的切り捨て: 最終バイトの下位4bitをオフセットとして4バイト読む
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_CONFIG.DIGITS).padStart(
    TOTP_CONFIG.DIGITS,
    '0',
  );
}

/**
 * 指定時刻の TOTP コードを生成する
 *
 * @param secretBase32 - base32 エンコードされた共有鍵
 * @param atMs - 基準時刻（ミリ秒）。省略時は現在時刻
 * @returns 6桁のコード
 */
export function generateTotpCode(
  secretBase32: string,
  atMs: number = Date.now(),
): string {
  return generateHotp(base32Decode(secretBase32), toCounter(atMs));
}

/**
 * コードが一致した時間ステップ（カウンタ値）を返す
 *
 * 端末の時刻ずれを吸収するため、前後 `WINDOW` ステップ分も許容する。
 * 窓を広げるほど総当たりの成功確率が上がるため、既定は前後1ステップ
 * （±30秒）に留めている。
 *
 * 一致したカウンタ値を返すのは、同じコードの使い回しを拒否できるようにするため。
 * 呼び出し側は「最後に成功したカウンタ値」を保存し、それ以下を拒否する。
 *
 * @param code - 利用者が入力したコード
 * @param secretBase32 - base32 エンコードされた共有鍵
 * @param atMs - 基準時刻（ミリ秒）。省略時は現在時刻
 * @returns 一致したカウンタ値。一致しなければ null
 */
export function findMatchingCounter(
  code: string,
  secretBase32: string,
  atMs: number = Date.now(),
): number | null {
  // 桁数・文字種が違う時点で HMAC を計算する必要はない
  if (!CODE_PATTERN.test(code)) {
    return null;
  }

  const secret = base32Decode(secretBase32);
  const baseCounter = toCounter(atMs);
  const input = Buffer.from(code, 'utf8');

  for (
    let offset = -TOTP_CONFIG.WINDOW;
    offset <= TOTP_CONFIG.WINDOW;
    offset++
  ) {
    const counter = baseCounter + offset;
    if (counter < 0) continue;

    // 桁数は固定で、入力も上の正規表現で同じ長さに絞ってある
    const expected = Buffer.from(generateHotp(secret, counter), 'utf8');

    if (timingSafeEqual(expected, input)) {
      return counter;
    }
  }

  return null;
}

/**
 * 入力されたコードを検証する
 *
 * 使い回しの判定が不要な場面（有効化時の所持確認など）向けの薄いラッパー。
 *
 * @param code - 利用者が入力したコード
 * @param secretBase32 - base32 エンコードされた共有鍵
 * @param atMs - 基準時刻（ミリ秒）。省略時は現在時刻
 * @returns 一致すれば true
 */
export function verifyTotpCode(
  code: string,
  secretBase32: string,
  atMs: number = Date.now(),
): boolean {
  return findMatchingCounter(code, secretBase32, atMs) !== null;
}
