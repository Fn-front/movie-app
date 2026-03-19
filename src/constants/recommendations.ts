/**
 * レコメンド関連の定数
 */

/**
 * レコメンド最大件数
 */
export const RECOMMENDATIONS_MAX_COUNT = 10;

/**
 * レコメンド生成リトライ上限（初回を除く追加試行回数）
 */
export const RECOMMENDATIONS_MAX_RETRIES = 2;

/**
 * アクティブユーザー判定期間（日数）
 * last_login_at がこの日数以内のユーザーのみレコメンド生成対象
 */
export const RECOMMENDATIONS_ACTIVE_USER_DAYS = 3;

/**
 * レコメンド手動更新設定
 */
export const RECOMMENDATION_REFRESH = {
  /** 月あたりの更新上限回数 */
  MAX_COUNT: 10,
} as const;

/**
 * レコメンドメッセージ
 */
export const RECOMMENDATIONS_MESSAGES = {
  NO_FAVORITES: 'お気に入りを登録すると、AIがおすすめ映画を提案します',
  NOT_GENERATED: 'おすすめ映画を準備中です',
  SECTION_TITLE: 'あなたへのおすすめ',
  GENERATION_ERROR: 'レコメンド生成中にエラーが発生しました',
} as const;

/**
 * レコメンド手動更新メッセージ
 */
export const RECOMMENDATION_REFRESH_MESSAGES = {
  SUCCESS: 'おすすめ映画を更新しました',
  LIMIT_EXCEEDED: '今月の更新回数上限に達しました（10回/月）',
  GENERATION_FAILED: 'レコメンド生成に失敗しました',
  FETCH_COUNT_FAILED: '更新回数の取得に失敗しました',
  RESET_NOTICE: '来月リセットされます',
  REMAINING_LABEL: (remaining: number, max: number) =>
    `残り${remaining}回 / 月${max}回`,
} as const;

/**
 * レコメンド手動更新エラーコード
 */
export const RECOMMENDATION_REFRESH_ERROR_CODE = {
  LIMIT_EXCEEDED: 'REFRESH_LIMIT_EXCEEDED',
  GENERATION_FAILED: 'GENERATION_FAILED',
} as const;
