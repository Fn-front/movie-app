/**
 * 劇場公開中の人気映画関連の定数
 */

import { successMessage } from './common';

/**
 * 劇場公開中の人気映画の表示件数
 */
export const NOW_SHOWING_DISPLAY_COUNT = 10;

/**
 * 劇場公開中の人気映画キャッシュの再検証間隔（秒） — 1時間
 */
export const NOW_SHOWING_REVALIDATE_SECONDS = 3600;

/**
 * 劇場公開中の人気映画セクションタイトル
 */
export const NOW_SHOWING_SECTION_TITLE = '劇場公開中の人気作品';

/**
 * 劇場公開中の人気映画成功メッセージ
 */
export const NOW_SHOWING_SUCCESS_MESSAGES = {
  /** 同期完了 */
  SYNC_COMPLETED: successMessage.updated('劇場公開中の人気映画'),
} as const;
