/**
 * OTPコードのハッシュ化
 *
 * OTPコードは認証材料そのものなので、`password_hash` と同様に平文で保存しない。
 *
 * ## なぜ素の SHA-256 ではだめか
 *
 * OTPコードは6桁の数字＝10^6通り（約20bit）しかない。SHA-256 は高速なので、
 * 100万通り全部のハッシュを事前計算するのは一般的なPCで1秒未満で終わる。
 * つまりDBが漏洩した時点で平文保存とほぼ同じになる。
 *
 * ソルトを足してもレインボーテーブルを防げるだけで、特定の行を狙った
 * 100万回の総当たりは止められない。
 *
 * ## HMAC + pepper を使う理由
 *
 * pepper（`OTP_HASH_PEPPER`）はDBではなく環境変数に置く。攻撃者がDBだけを
 * 手に入れても鍵を知らないため HMAC を計算できず、総当たりが成立しない。
 *
 * メールアドレスをメッセージに含めることで、同じコードでも行ごとに異なる
 * ハッシュになり、横断的な突合を防ぐ。
 *
 * 256bit の乱数である検証済みトークン（`verificationToken.ts`）は入力の
 * エントロピーが十分なため素の SHA-256 でよく、こちらとは要件が異なる。
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { getRequiredEnv } from '@/utils/env';

/**
 * OTPコードをハッシュ化する
 *
 * @param code - 6桁の確認コード
 * @param email - 宛先メールアドレス（行ごとにハッシュを変えるために含める）
 * @returns HMAC-SHA256 ハッシュ（hex）
 * @throws OTP_HASH_PEPPER が未設定の場合
 */
export function hashOtpCode(code: string, email: string): string {
  // 未設定のまま平文へフォールバックすると本Issueの修正が無意味になるため、
  // 黙って動かさず落とす（fail-closed）
  const pepper = getRequiredEnv('OTP_HASH_PEPPER');

  return createHmac('sha256', pepper)
    .update(`${email.toLowerCase()}:${code}`)
    .digest('hex');
}

/**
 * 入力されたコードが保存済みハッシュと一致するか検証する
 *
 * 比較は `timingSafeEqual` で行う。6桁・試行回数制限ありの状況で
 * タイミング攻撃が実用的になる可能性は低いが、コストがほぼゼロのため
 * 短絡比較を避ける。
 *
 * @param code - 入力された確認コード
 * @param email - 宛先メールアドレス
 * @param storedHash - DBに保存されているハッシュ（hex）
 * @returns 一致すれば true
 */
export function verifyOtpCode(
  code: string,
  email: string,
  storedHash: string | null,
): boolean {
  if (!storedHash) return false;

  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashOtpCode(code, email), 'hex');

  // 長さが違うと timingSafeEqual が例外を投げるため先に弾く。
  // ここで漏れるのは「保存値がhex 32バイトか」だけで、コードの中身ではない
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
