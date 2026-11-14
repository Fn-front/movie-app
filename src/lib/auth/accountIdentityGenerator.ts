/**
 * 管理者発行アカウントの識別子を**生成する**
 *
 * ⚠️ **サーバー専用。クライアントから import しないこと**（#1104）。
 *
 * Node の `crypto` を読むため、クライアントのバンドルへ混ざると Next.js が
 * `crypto-browserify` ポリフィル（508KB）を同梱する。このポリフィルは
 * `vm-browserify` の `Script.runInThisContext`（`eval`）と `function-bind` の
 * `Function(...)` シムを含んでおり、本番の `script-src` に当たって
 * **enforce の違反が毎ロード報告される**（`report-uri /api/csp-report`）。
 *
 * 実際に起きていた。`isEmailIdentifier` / `isUsernameShape` が同じファイルに
 * 同居していたせいで `@/schema/auth` 経由でフォームへ引き込まれ、
 * `/auth/signup`・`/auth/signin`・`/auth/forgot-password` などで違反が出ていた。
 * **判定（純粋）と生成（crypto）を分けてあるのはそのため。**
 *
 * 判定側は `./accountIdentity` にある。あちらへ `crypto` を戻さないこと。
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
 * ⚠️ Web Crypto（`crypto.getRandomValues`）への置き換えでポリフィルを避ける手も
 * あるが、偏りの無い整数生成を自前で書くことになる。生成はサーバーでしか
 * 呼ばないので、分離で足りる。
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
