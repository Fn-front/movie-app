/**
 * 管理者発行アカウントの識別子を組み立てる
 *
 * メールアドレスを保存しないアカウント（admin が発行する）は、ログイン識別子に
 * ユーザー名を使う。`users.email` は NOT NULL / UNIQUE のままなので、制約を
 * 満たすための合成アドレスもここで作る。
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

import { randomInt } from 'crypto';

import {
  ACCOUNT_IDENTITY_ALPHABET,
  USERNAME_CONFIG,
  SYNTHETIC_EMAIL_CONFIG,
} from '@/constants/accountIdentity';

/**
 * 指定した長さのランダム文字列を作る
 *
 * `randomInt` は CSPRNG かつ剰余による偏りが無い。`Math.random` は予測可能で、
 * ユーザー名が推測できると総当たりの入口が広がる。
 *
 * @param length - 文字数
 * @returns ランダム文字列（`ACCOUNT_IDENTITY_ALPHABET` の文字のみ）
 */
function randomToken(length: number): string {
  return Array.from(
    { length },
    () =>
      ACCOUNT_IDENTITY_ALPHABET[randomInt(ACCOUNT_IDENTITY_ALPHABET.length)],
  ).join('');
}

/**
 * ログイン用のユーザー名を生成する
 *
 * 紛らわしい文字（`0/O`・`1/I/L`・`U/V`）を除いた29文字から12文字を選ぶため
 * 約58bit。列挙されても推測できない。
 *
 * 読み書きしやすいよう `XXXX-XXXX-XXXX` 形式で区切る。照合時は
 * `normalizeUsername` でハイフンと大小文字の揺れを吸収する。
 *
 * ⚠️ `@` を含めないこと。ログインフォームはメールアドレスと同じ欄で受け、
 * `@` の有無で判定している。
 *
 * @returns `XXXX-XXXX-XXXX` 形式のユーザー名
 */
export function generateUsername(): string {
  const raw = randomToken(USERNAME_CONFIG.LENGTH);
  const groups: string[] = [];

  for (let i = 0; i < raw.length; i += USERNAME_CONFIG.GROUP_SIZE) {
    groups.push(raw.slice(i, i + USERNAME_CONFIG.GROUP_SIZE));
  }

  return groups.join('-');
}

/**
 * 入力されたユーザー名を正規化する
 *
 * 利用者はメールで受け取った文字列を手で打ち込むため、大小文字・ハイフン・
 * 空白の揺れを吸収する。保存時と照合時で必ず同じ関数を通すこと。
 *
 * @param username - 入力されたユーザー名
 * @returns 正規化したユーザー名（大文字・区切りなし）
 */
export function normalizeUsername(username: string): string {
  return username.toUpperCase().replace(/[-\s]/g, '');
}

/**
 * `users.email` の NOT NULL / UNIQUE を満たすための合成アドレスを作る
 *
 * `.invalid` は RFC 2606 の予約TLDで、**絶対に名前解決されない**。実在ドメインを
 * 使うと、何かの拍子に赤の他人へ配送される事故が起きる。
 *
 * ⚠️ この値は**内部識別子のみ**。本人には教えず、パスワード復旧にも使わない。
 * 教えた時点で「平文で DB に保存された復旧の鍵」になり、リカバリーコードが
 * 鍵付きHMACで保存されているのと比べて明確な後退になる。
 *
 * ⚠️ ユーザー名から導出しないこと。導出できる形式だと、ユーザー名を知る者が
 * このアドレスを再現できてしまう。
 *
 * @returns `<ランダム>@<ランダム>.invalid` 形式のアドレス（小文字）
 */
export function generateSyntheticEmail(): string {
  const localPart = randomToken(SYNTHETIC_EMAIL_CONFIG.LOCAL_PART_LENGTH);
  const subdomain = randomToken(SYNTHETIC_EMAIL_CONFIG.SUBDOMAIN_LENGTH);

  return `${localPart}@${subdomain}.${SYNTHETIC_EMAIL_CONFIG.TLD}`.toLowerCase();
}

/**
 * 合成アドレス（＝メールを持たないアカウント）かどうかを判定する
 *
 * 公開のパスワードリセット経路（`/api/auth/password-reset/request`）に
 * このアドレスを通してはいけない。実送信が必ず失敗し、500 応答から
 * アドレスの存在判定が漏れる。
 *
 * @param email - 判定するアドレス
 * @returns 合成アドレスなら true
 */
export function isSyntheticEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`.${SYNTHETIC_EMAIL_CONFIG.TLD}`);
}

/**
 * ユーザー名として妥当な形かどうかを判定する
 *
 * ログイン欄はメールアドレスと兼用のため、`@` を含まない入力は無条件で
 * ユーザー名として扱われる。形を検証しないと、`userexample.com` のような
 * **`@` を打ち忘れたメールアドレス**が「存在しないアカウント名」として
 * 処理され、利用者は形式エラーではなく認証失敗を見ることになる。
 *
 * 生成時と同じ文字種・長さであることを確認する。
 *
 * @param value - 入力された文字列（正規化前でよい）
 * @returns ユーザー名として妥当なら true
 */
export function isUsernameShape(value: string): boolean {
  const normalized = normalizeUsername(value);

  if (normalized.length !== USERNAME_CONFIG.LENGTH) return false;

  return [...normalized].every((char) =>
    ACCOUNT_IDENTITY_ALPHABET.includes(char),
  );
}

/**
 * 入力された識別子がメールアドレスかユーザー名かを判定する
 *
 * ログインフォームは同じ欄で両方を受ける。ユーザー名の文字種に `@` が
 * 含まれないため、`@` の有無で曖昧さなく振り分けられる。
 *
 * @param identifier - 入力された識別子
 * @returns メールアドレスなら true
 */
export function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes('@');
}
