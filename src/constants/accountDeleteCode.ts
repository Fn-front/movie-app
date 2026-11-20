/**
 * 退会の確認コード（#1362）
 *
 * ⛔ **`OTP_ACTION`（`otp.ts`）には足さない。**
 *
 * 足すと `src/schema/otp.ts` の `PUBLIC_OTP_ACTIONS` 経由で
 * `/api/auth/otp/send` が受理する。あちらは宛先をセッションに固定する処理を
 * `password_change` のときしか行わないため、**未認証のまま任意のアドレスへ
 * 自サービス名義の確認コードを送れる**（#641 / #1261 / #1359）。
 *
 * ⚠️ **既存の `two_factor` を流用しない。** 件名・本文が「二段階認証」になり、
 * 用途を明記して読み上げ型のソーシャルエンジニアリングを防ぐ設計（#648）が
 * 崩れる。退会のコードは「退会」と読めなければならない。
 */

/** `otp_codes.action_type` に入れる値 */
export const ACCOUNT_DELETE_OTP_ACTION = 'account_delete' as const;

export type AccountDeleteOtpAction = typeof ACCOUNT_DELETE_OTP_ACTION;

/** 利用者向けの文言 */
export const ACCOUNT_DELETE_CODE_MESSAGES = {
  /** コードを送った */
  CODE_SENT: '登録のメールアドレスに確認コードを送りました。',
  /** コードが要る旨の説明 */
  DESCRIPTION:
    'ご本人確認のため、登録のメールアドレスに確認コードをお送りします。',
  /** コード未入力 */
  CODE_REQUIRED: '確認コードを入力してください。',
  /**
   * コードが要らない利用者が送信を要求した
   *
   * ⚠️ パスワードを持つ利用者は退会時にパスワードを要求されるので、
   * このコードを使う場面が無い。送ると無駄なメールが届くだけ。
   */
  CODE_NOT_REQUIRED:
    'このアカウントの削除には確認コードを使いません。現在のパスワードを入力してください。',
  /** 不一致・期限切れ・試行回数超過。区別して返さない */
  CODE_INVALID:
    '確認コードが正しくありません。期限切れの場合は再送してください。',
  /**
   * コードが届かないアカウント
   *
   * ⚠️ admin が発行したアカウントは `users.email` が
   * `generateSyntheticEmail()` の `.invalid` TLD（RFC 2606、絶対に名前解決
   * されない）なので、送っても永久に届かない。黙って送ると「待っても来ない」
   * 行き止まりになるため、窓口へ誘導する。
   *
   * ⚠️ 実際には到達しない想定（発行アカウントは必ずパスワードを持つので
   * パスワード照合の分岐に入る）。防御的に残す。
   */
  EMAIL_UNAVAILABLE:
    'このアカウントには確認コードをお送りできません。お手数ですが窓口までご連絡ください。',
} as const;
