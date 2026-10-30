/**
 * 管理者発行アカウントの定数
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

/**
 * トークンの有効期限と操作の上限。
 */
export const ADMIN_ACCOUNT_CONFIG = {
  /**
   * 新規発行時のリンクの有効期限（分）— 24時間。
   *
   * 受け取る相手がメールに気づくまでの時間を見込む。ただし無期限にはしない。
   * 宛先を保存しない設計では誤送信の追跡も取り消しもできないため、
   * **時間で自動的に無効になることが唯一の安全弁**になる。
   */
  CREATE_LINK_EXPIRY_MINUTES: 24 * 60,
  /**
   * 再発行時のリンクの有効期限（分）— 1時間。
   *
   * 新規発行と違い、既にデータが入っているアカウントを渡すことになる。
   * admin が対象を選び間違えたときの窓を短くする。
   */
  REISSUE_LINK_EXPIRY_MINUTES: 60,
  /**
   * admin 単位の発行上限（回 / 窓）。
   *
   * この機能は「任意の宛先へ自ドメイン名義でメールを送れる」性質を持つ。
   * admin セッションを奪われた場合に、正規ドメインからのフィッシングメールを
   * 大量に送られないよう上限を設ける（#641 と同じ理屈）。
   */
  ISSUE_LIMIT: { maxAttempts: 20, windowMinutes: 60 },
} as const;

/**
 * 監査ログに記録する操作の種別。
 *
 * DB 側の `chk_admin_audit_action` と**必ず一致させること**。
 */
export const ADMIN_AUDIT_ACTION = {
  /** アカウントの新規発行 */
  ACCOUNT_CREATE: 'account_create',
  /** パスワード設定リンクの再発行 */
  ACCOUNT_REISSUE: 'account_reissue',
} as const;

export type AdminAuditAction =
  (typeof ADMIN_AUDIT_ACTION)[keyof typeof ADMIN_AUDIT_ACTION];

/**
 * 画面・APIのメッセージ
 */
export const ADMIN_ACCOUNT_MESSAGES = {
  /** 発行成功 */
  CREATED: 'アカウントを発行し、設定リンクを送信しました。',
  /** 再発行成功 */
  REISSUED: '設定リンクを再送しました。',
  /** 一覧取得失敗 */
  FETCH_ERROR: 'アカウント一覧の取得に失敗しました。',
  /** 発行失敗 */
  CREATE_ERROR: 'アカウントの発行に失敗しました。',
  /** 再発行失敗 */
  REISSUE_ERROR: '設定リンクの再送に失敗しました。',
  /** メール送信失敗 */
  EMAIL_SEND_FAILED: 'メールの送信に失敗しました。',
  /** 対象アカウントが見つからない */
  NOT_FOUND: '対象のアカウントが見つかりません。',
  /**
   * 再発行の対象外。
   *
   * メールを持つ通常のアカウントは、利用者自身がパスワードリセットを
   * 使える。admin がそれらのパスワードを差し替えられると、バックドアの
   * 範囲が全アカウントへ広がる。
   */
  NOT_ISSUED_ACCOUNT:
    'このアカウントは管理者発行ではないため、再発行できません。',
  /** 入力が不正 */
  INVALID_BODY: '入力内容に誤りがあります。',
} as const;

/** 一覧の取得件数 */
export const ADMIN_ACCOUNT_LIST_LIMIT = 100;
