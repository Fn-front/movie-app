/**
 * OTP関連の定数
 */

/**
 * OTPアクション種別
 */
export const OTP_ACTION = {
  /** 新規登録時のメール認証 */
  REGISTRATION: 'registration',
  /** パスワード変更の本人確認 */
  PASSWORD_CHANGE: 'password_change',
} as const;

export type OtpAction = (typeof OTP_ACTION)[keyof typeof OTP_ACTION];

/**
 * OTP設定
 */
export const OTP_CONFIG = {
  /** OTPコードの桁数 */
  CODE_LENGTH: 6,
  /**
   * 有効期限（分）
   *
   * 10分から延ばした（#1258）。メールの遅延や迷惑メールフォルダを探している
   * うちに切れ、そのたびに再送して**日次5通を使い切る**経路があった。使い切ると
   * 登録を完了する手段が無くなり、最大24時間なにもできなくなる。
   *
   * ⚠️ 延ばしても総当たり耐性は落ちない。6桁＝100万通りに対して守っているのは
   * `MAX_ATTEMPTS`（下の5回）で、**時間ではなく試行回数**。期限は「受信箱を
   * 後から覗かれる窓」を狭めるためのもので、パスワードリセットのトークンも
   * 同じ30分（`PASSWORD_RESET_CONFIG.EXPIRY_MINUTES`）。
   *
   * ⚠️ この値はメール本文にも出る（`src/constants/email.ts:85`）。
   * 直接書かずに必ずここを参照すること
   */
  EXPIRY_MINUTES: 30,
  /**
   * 最大検証試行回数
   *
   * ⚠️ コードの総当たりを止めているのは**こちら**。`EXPIRY_MINUTES` を
   * 変えるときは、ここが効いていることを前提にしてよい
   */
  MAX_ATTEMPTS: 5,
  /** 再送間隔（秒） */
  RESEND_INTERVAL_SECONDS: 60,
  /** 日次送信上限 */
  DAILY_SEND_LIMIT: 5,
  /** 日次送信上限のウィンドウ（分） — 24時間 */
  DAILY_SEND_WINDOW_MINUTES: 1440,
  /** OTP検証済みトークンの有効期限（分） — verified_atからの経過時間 */
  VERIFIED_TOKEN_EXPIRY_MINUTES: 5,
  /** 検証試行のレート制限上限（回） — attemptsとは独立したエンドポイント単位の多層防御。この回数を超えるとロックされる */
  VERIFY_RATE_LIMIT: 10,
  /** 検証試行の超過後ロック継続時間（分） — スライディングウィンドウの集計幅ではなく、上限超過時点からこの時間ロックする */
  VERIFY_RATE_LIMIT_WINDOW_MINUTES: 10,
} as const;

/**
 * タイミング攻撃・メールアドレス列挙防止用のランダム遅延（ミリ秒）
 */
export const OTP_RANDOM_DELAY = { MIN_MS: 200, RANGE_MS: 300 } as const;

/**
 * OTPエラーメッセージ
 */
export const OTP_ERROR_MESSAGES = {
  /** OTPコードが間違っている */
  INVALID_CODE: '確認コードが間違っています。',
  /** OTPコードの有効期限切れ */
  CODE_EXPIRED: '確認コードの有効期限が切れました。再送信してください。',
  /** 試行回数超過 */
  MAX_ATTEMPTS_EXCEEDED:
    '試行回数の上限に達しました。新しいコードを再送信してください。',
  /** 再送間隔が短すぎる */
  RESEND_TOO_SOON: 'しばらく待ってから再送信してください。',
  /** 日次送信上限超過 */
  DAILY_LIMIT_EXCEEDED: '本日の送信上限に達しました。明日再度お試しください。',
  /** 検証試行のレート制限超過 */
  VERIFY_RATE_LIMIT_EXCEEDED:
    '検証の試行回数が多すぎます。しばらく待ってから再度お試しください。',
  /** OTPコードが見つからない */
  CODE_NOT_FOUND: '有効な確認コードが見つかりません。再送信してください。',
  /** ユーザーが見つからない */
  USER_NOT_FOUND: '登録されていないメールアドレスです。',
  /** 既に認証済み */
  ALREADY_VERIFIED: 'このメールアドレスは既に認証済みです。',
  /** メール送信失敗 */
  EMAIL_SEND_FAILED: '確認コードの送信に失敗しました。',
  /** OTP検証が未完了 */
  OTP_NOT_VERIFIED: 'OTP検証が完了していません。',
  /** サーバーエラー */
  VERIFY_SERVER_ERROR: 'OTP検証中にエラーが発生しました。',
} as const;

/**
 * OTP成功メッセージ
 */
export const OTP_SUCCESS_MESSAGES = {
  /** コード送信成功 */
  CODE_SENT: '確認コードを送信しました。',
  /** コード再送信成功 */
  CODE_RESENT: '確認コードを再送信しました。',
  /** メール認証完了 */
  EMAIL_VERIFIED: 'メール認証が完了しました。',
  /** コード検証成功 */
  CODE_VERIFIED: 'コード検証に成功しました。',
} as const;

/**
 * `otp_codes` の保持期間（時間）— #978
 *
 * 有効期限（`OTP_CONFIG.EXPIRY_MINUTES` = 30分）を過ぎてから、さらにこの時間が
 * 経ったレコードを日次CRONが消す。
 *
 * ⚠️ 期限切れ直後に消さない理由は2つ。
 *   1. `auth/otp/send` の **60秒の再送間隔は直前の行の `created_at` だけ**を
 *      根拠にしている。消すと再送間隔が素通りする
 *   2. 障害調査の余地を残す（「コードが届かない」の問い合わせは当日中に来る）
 *
 * `rate_limits`（`RATE_LIMIT_RETENTION_HOURS` = 48）と同じ値に揃える。
 * 揃えるのは、どちらも「不要となった個人データの消去」という同じ関心事で、
 * 別々の値にすると privacy の説明が増えるだけで意味が無いため。
 */
export const OTP_CODE_RETENTION_HOURS = 48;
