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
 * 設定リンクが「admin 発行経由」であることを示すクエリパラメータ。
 *
 * 発行アカウントの `users.email` は受信できない合成アドレスなので、
 * 受け取り手は `/auth/forgot-password` から再送できない（列挙防止のため
 * 応答は成功と同じで、理由も表示されない）。復旧は admin の再発行だけ。
 * 設定ページが案内を出し分けられるように、**リンクを作る側**が印を付ける。
 *
 * 判定に DB を引かないのは、`/auth/reset-password` が未認証で叩ける公開
 * ページで、レート制限の仕組みが無いため。`?token=` に任意の文字列を入れて
 * 連打されると、ページ表示のたびに SELECT が走る。
 *
 * ⚠️ 手で付ければ誰でも案内を出せるが、**変わるのは文言だけ**で、
 * トークンの検証も権限も一切この値に依存しない。
 */
export const ACCOUNT_SETUP_ISSUED_PARAM = {
  NAME: 'issued',
  VALUE: '1',
} as const;

/**
 * 設定リンクにアカウント名を載せるクエリパラメータ（#1237）
 *
 * 発行アカウントは**ユーザー名でログインする**が、それが伝わるのは発行メールの
 * 本文だけだった。設定ページにもログインページにも出ないため、メールを閉じた
 * 利用者が自分のメールアドレスを入れてログインに失敗する事故が起きた。
 *
 * メールに既に書かれている値なので、リンクに載せても露出は増えない。同じ URL に
 * 載っているトークンのほうがはるかに秘密度が高い。DB を引かないのは
 * `ACCOUNT_SETUP_ISSUED_PARAM` と同じ理由（公開ページにレート制限が無い）。
 *
 * ⚠️ 表示にしか使わない。トークンの検証にも認可にも関与させないこと
 */
export const ACCOUNT_SETUP_USERNAME_PARAM = 'account';

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
