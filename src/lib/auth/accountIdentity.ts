/**
 * 管理者発行アカウントの識別子を**判定・正規化する**
 *
 * メールアドレスを保存しないアカウント（admin が発行する）は、ログイン識別子に
 * ユーザー名を使う。ここにあるのは、その識別子を**読む**ための純粋関数だけ。
 *
 * ⚠️ **このファイルへ `crypto` を import しないこと**（#1104）。
 *
 * `@/schema/auth` がここから `isEmailIdentifier` / `isUsernameShape` を読み、
 * その zod スキーマをログイン・新規登録・パスワード変更などの**クライアント
 * コンポーネントが import する**。つまりここは**クライアントのバンドルに乗る**。
 *
 * `crypto` が混ざると Next.js が `crypto-browserify` ポリフィル（508KB）を
 * 同梱し、その中の `vm-browserify`（`eval`）と `function-bind`（`Function(...)`）が
 * 本番の `script-src` に当たって **enforce の違反が毎ロード報告される**
 * （`report-uri /api/csp-report`。IP単位 60 req/分の枠を雑音で食う）。
 *
 * 実際に `/auth/signup`・`/auth/signin`・`/auth/forgot-password` で1件ずつ
 * 出ていた。生成側（CSPRNG が要る）は `./accountIdentityGenerator` に分けてある。
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

import {
  ACCOUNT_IDENTITY_ALPHABET,
  USERNAME_CONFIG,
  SYNTHETIC_EMAIL_CONFIG,
} from '@/constants/accountIdentity';

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
 * 生成時（`accountIdentityGenerator`）と同じ文字種・長さであることを確認する。
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
