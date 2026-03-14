/**
 * レコメンド関連の定数
 */

/**
 * レコメンド最大件数
 */
export const RECOMMENDATIONS_MAX_COUNT = 10;

/**
 * レコメンドのstaleTime（1時間）
 */
export const RECOMMENDATIONS_STALE_TIME = 60 * 60 * 1000;

/**
 * レコメンドメッセージ
 */
export const RECOMMENDATIONS_MESSAGES = {
  NO_FAVORITES: 'お気に入りを登録すると、AIがおすすめ映画を提案します',
  NOT_GENERATED: 'おすすめ映画を準備中です',
  SECTION_TITLE: 'あなたへのおすすめ',
  GENERATION_ERROR: 'レコメンド生成中にエラーが発生しました',
} as const;
