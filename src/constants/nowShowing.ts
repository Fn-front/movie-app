/**
 * 劇場公開中の人気映画関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * 劇場公開中の人気映画の表示件数
 */
export const NOW_SHOWING_DISPLAY_COUNT = 10;

/**
 * 劇場公開中の人気映画のTanStack Queryキャッシュ有効時間（ミリ秒）
 * 週次更新のため24時間キャッシュ
 */
export const NOW_SHOWING_STALE_TIME = 1000 * 60 * 60 * 24;

/**
 * 劇場公開中の人気映画セクションタイトル
 */
export const NOW_SHOWING_SECTION_TITLE = '劇場公開中の人気作品';

/**
 * 劇場公開中の人気映画エラーメッセージ
 */
export const NOW_SHOWING_ERROR_MESSAGES = {
  /** 取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed('劇場公開中の人気映画'),
} as const;

/**
 * 劇場公開中の人気映画成功メッセージ
 */
export const NOW_SHOWING_SUCCESS_MESSAGES = {
  /** 同期完了 */
  SYNC_COMPLETED: successMessage.updated('劇場公開中の人気映画'),
} as const;
