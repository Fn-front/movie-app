/**
 * リカバリーコード
 *
 * 認証アプリを失った利用者が自力で復旧するための使い捨てコード。
 * これが無いと、端末紛失＝アカウント永久ロックになる。
 *
 * パスワードをバイパスできる資格情報そのものなので、DB には平文を置かず
 * HMAC-SHA256（サーバ側の鍵付き）で保存する。
 *
 * bcrypt ではなく HMAC を選ぶ理由:
 * - コードは人間が選ぶものではなく約48bitの乱数なので、総当たりを遅くする
 *   ストレッチよりも「鍵が無ければ検証できない」ことのほうが効く。DB だけが
 *   漏れてもオフライン総当たりが成立しない
 * - 10件を bcrypt(cost=12) でハッシュ化すると発行に数秒、照合にも数秒かかる。
 *   HMAC なら無視できる
 */

import { createHmac, randomInt, timingSafeEqual } from 'crypto';

import { RECOVERY_CODE_CONFIG } from '@/constants/totp';

import { deriveTotpKey, KEY_PURPOSE } from './keys';

/**
 * コードに使う文字。
 *
 * 書き写したものを読み違えないよう、紛らわしい文字（0/O、1/I/L、U/V）を除いている。
 * 29文字から10文字を選ぶので約48bit。
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';

/**
 * リカバリーコードを1つ生成する
 *
 * @returns `XXXXX-XXXXX` 形式のコード
 */
function generateRecoveryCode(): string {
  // randomInt は CSPRNG かつ剰余による偏りが無い
  const raw = Array.from(
    { length: RECOVERY_CODE_CONFIG.LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join('');

  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += RECOVERY_CODE_CONFIG.GROUP_SIZE) {
    groups.push(raw.slice(i, i + RECOVERY_CODE_CONFIG.GROUP_SIZE));
  }

  return groups.join('-');
}

/**
 * 入力されたリカバリーコードを正規化する
 *
 * 利用者は印刷したものを手で打ち込むため、大文字小文字・ハイフン・空白の
 * 揺れを吸収する。ハッシュ化前にも同じ関数を通し、保存時と照合時で
 * 必ず同じ形にする。
 *
 * @param code - 入力されたコード
 * @returns 正規化したコード
 */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[-\s]/g, '');
}

/**
 * リカバリーコードをハッシュ化する
 *
 * @param code - 平文のコード（正規化前でよい）
 * @returns HMAC-SHA256（hex）
 */
export function hashRecoveryCode(code: string): string {
  return createHmac('sha256', deriveTotpKey(KEY_PURPOSE.RECOVERY_CODE_HMAC))
    .update(normalizeRecoveryCode(code))
    .digest('hex');
}

/**
 * リカバリーコード一式を生成し、平文とハッシュを返す
 *
 * 平文は発行時に一度だけ利用者へ見せるためのもので、DB には保存しない。
 *
 * @returns 平文コードの配列と、同じ順序のハッシュ配列
 */
export function generateRecoveryCodes(): {
  codes: string[];
  hashes: string[];
} {
  const codes = Array.from(
    { length: RECOVERY_CODE_CONFIG.COUNT },
    generateRecoveryCode,
  );

  return { codes, hashes: codes.map(hashRecoveryCode) };
}

/**
 * 入力されたコードが、保存済みハッシュのいずれかに一致するか調べる
 *
 * 一致したハッシュを返すのは、呼び出し側がその1件だけを使用済みにできるように
 * するため。リカバリーコードは使い捨てなので、使われたものは必ず無効化する。
 *
 * 一致後も残りを全て比較するのは、照合に要する時間から「何番目のコードか」が
 * 漏れないようにするため。
 *
 * @param inputCode - 利用者が入力したコード
 * @param storedHashes - DB に保存されているハッシュ
 * @returns 一致したハッシュ。一致しなければ null
 */
export function findMatchingRecoveryCodeHash(
  inputCode: string,
  storedHashes: readonly string[],
): string | null {
  const inputHash = Buffer.from(hashRecoveryCode(inputCode), 'utf8');
  let matched: string | null = null;

  for (const storedHash of storedHashes) {
    const candidate = Buffer.from(storedHash, 'utf8');

    // 長さが違うと timingSafeEqual が例外になる。DB の値が壊れている場合に備える
    if (candidate.length !== inputHash.length) {
      continue;
    }

    if (timingSafeEqual(candidate, inputHash)) {
      matched = storedHash;
    }
  }

  return matched;
}
