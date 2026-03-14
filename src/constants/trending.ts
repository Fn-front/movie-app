/**
 * トレンド映画関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * トレンド映画の表示件数
 */
export const TRENDING_DISPLAY_COUNT = 10;

/**
 * トレンド映画のTanStack Queryキャッシュ有効時間（ミリ秒）
 * 週次更新のため24時間キャッシュ
 */
export const TRENDING_STALE_TIME = 1000 * 60 * 60 * 24;

/**
 * トレンド映画セクションタイトル
 */
export const TRENDING_SECTION_TITLE = '今週のトレンド';

/**
 * トレンド映画エラーメッセージ
 */
export const TRENDING_ERROR_MESSAGES = {
  /** トレンド映画取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed('トレンド映画'),
} as const;

/**
 * トレンド映画成功メッセージ
 */
export const TRENDING_SUCCESS_MESSAGES = {
  /** トレンド映画同期完了 */
  SYNC_COMPLETED: successMessage.updated('トレンド映画'),
} as const;
