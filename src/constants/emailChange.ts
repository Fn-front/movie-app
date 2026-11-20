/**
 * メールアドレス変更に関する定数（#1359）
 *
 * アドレスは**ログイン識別子そのもの**なので、変更できないと
 * 会社・学校のアドレスで登録した人が退職・卒業で詰む。
 */

/**
 * 変更確認コードの `otp_codes.action_type`
 *
 * ⚠️ **`OTP_ACTION`（src/constants/otp.ts）に足してはいけない。**
 *
 * `src/schema/otp.ts` の `PUBLIC_OTP_ACTIONS` は「公開ルートが受け付ける用途」で、
 * そこへ入ると `/api/auth/otp/send` と `/api/auth/otp/verify` がこれを受理する。
 *
 * `send` の action 分岐は宛先をセッションに固定する処理を `password_change` の
 * ときしか行わない。したがってこの用途は存在チェックも宛先固定も通らないまま
 * 送信へ到達し、**未認証のまま任意のアドレスへ自サービス名義の確認コードを
 * 送れる**状態になる（#641 で塞いだ穴の再発）。
 *
 * ⚠️ とくにこの用途は**宛先が「まだ本人のものでないアドレス」**なので、
 * 公開されたときの被害が第2要素より大きい。送信は
 * `src/lib/auth/sendEmailChangeCode.ts` からだけ行う（#1261 と同じ方針）。
 */
export const EMAIL_CHANGE_OTP_ACTION = 'email_change' as const;

export type EmailChangeOtpAction = typeof EMAIL_CHANGE_OTP_ACTION;

/** 利用者向けの文言 */
export const EMAIL_CHANGE_MESSAGES = {
  /** 画面の説明 */
  DESCRIPTION:
    'ログインに使うメールアドレスを変更します。新しいアドレスに確認コードを送るので、受信できるアドレスを入力してください。',
  /** コードを送った */
  CODE_SENT: '新しいメールアドレスに確認コードを送りました。',
  /** 変更できた */
  CHANGED: 'メールアドレスを変更しました。',
  /** 既に使われている */
  ALREADY_USED: 'このメールアドレスは使用できません。',
  /** 今と同じアドレス */
  SAME_AS_CURRENT: '現在のメールアドレスと同じです。',
  /** パスワードを持たない利用者 */
  PASSWORD_REQUIRED:
    'ソーシャルログインのみのアカウントではメールアドレスを変更できません。',
  /**
   * ソーシャルログインを連携している利用者
   *
   * ⚠️ パスワードの有無とは別の条件。**両方**持っている人が該当する。
   */
  SOCIAL_LINKED:
    'ソーシャルログインと連携しているアカウントのメールアドレスは変更できません。',
  /** 変更できなかった */
  FAILED:
    'メールアドレスを変更できませんでした。時間をおいて再度お試しください。',
  /** 旧アドレスへの通知の件名 */
  NOTICE_SUBJECT: 'メールアドレスが変更されました',
} as const;

/**
 * 変更フォームの画面状態
 *
 * ⚠️ **フックではなくここに置く。** フックは `next-auth/react` を
 * import するため、テストが `jest.requireActual` でこの定数だけ
 * 取りにいくと ESM の読み込みで落ちる（実測）。
 */
export const EMAIL_CHANGE_VIEW = {
  /** 新しいアドレスとパスワードの入力 */
  INPUT: 'input',
  /** 確認コードの入力 */
  CODE: 'code',
} as const;

export type EmailChangeView =
  (typeof EMAIL_CHANGE_VIEW)[keyof typeof EMAIL_CHANGE_VIEW];
