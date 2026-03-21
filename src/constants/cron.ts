/**
 * CRONジョブ関連の定数
 */

/**
 * CRONジョブのエラーメッセージ
 */
export const CRON_ERROR_MESSAGES = {
  /** 映画.com同期エラー */
  SYNC_MOVIES: '映画同期中にエラーが発生しました。',
  /** Now Playing同期エラー */
  SYNC_NOW_PLAYING: 'Now Playing映画同期中にエラーが発生しました。',
  /** 劇場公開中映画同期エラー */
  SYNC_NOW_SHOWING: '劇場公開中の人気映画同期中にエラーが発生しました。',
  /** 映画キャッシュバッチ更新エラー */
  UPDATE_MOVIES: '映画キャッシュのバッチ更新中にエラーが発生しました。',
  /** レコメンド生成エラー */
  GENERATE_RECOMMENDATIONS: 'レコメンド生成中にエラーが発生しました。',
  /** 受賞作品同期エラー */
  SYNC_AWARD_MOVIES: '受賞作品同期中にエラーが発生しました。',
  /** ユーザー取得失敗 */
  FETCH_USERS_FAILED: 'ユーザー取得に失敗しました',
  /** アクティブユーザー取得失敗 */
  FETCH_ACTIVE_USERS_FAILED: 'アクティブユーザー取得に失敗しました',
} as const;
