/**
 * 管理者発行アカウントの識別子に関する定数
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

/**
 * ユーザー名・合成アドレスに使う文字。
 *
 * 書き写したものを読み違えないよう、紛らわしい文字（`0/O`、`1/I/L`、`U/V`）を
 * 除いている。`src/lib/totp/recoveryCodes.ts` と同じ並びで、同じ理由による。
 *
 * ⚠️ `@` を含めないこと。ログインフォームはメールアドレスと同じ欄で受け、
 * `@` の有無でどちらかを判定している。
 */
export const ACCOUNT_IDENTITY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';

/**
 * ユーザー名の構成。
 *
 * 29文字から12文字を選ぶので約58bit。列挙されても推測できない。
 * 短くすると総当たりの入口が広がるため、縮めないこと。
 */
export const USERNAME_CONFIG = {
  /** 文字数（区切りを除く） */
  LENGTH: 12,
  /** 読みやすさのために区切る位置 */
  GROUP_SIZE: 4,
} as const;

/**
 * 合成メールアドレスの構成。
 *
 * `users.email` の NOT NULL / UNIQUE を満たすためだけの値で、本人には教えない。
 */
export const SYNTHETIC_EMAIL_CONFIG = {
  /** ローカル部の文字数 */
  LOCAL_PART_LENGTH: 12,
  /**
   * サブドメインの文字数。
   *
   * ローカル部だけでなくドメイン側もランダムにするのは、万一アドレスが
   * 漏れても他のアカウントのアドレスを推測できないようにするため。
   */
  SUBDOMAIN_LENGTH: 12,
  /**
   * RFC 2606 の予約TLD。**絶対に名前解決されない**。
   *
   * 実在ドメインを使うと、何かの拍子に赤の他人へ配送される事故が起きる。
   */
  TLD: 'invalid',
} as const;
