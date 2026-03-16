/**
 * 原題提案機能の定数
 */

import { errorMessage } from './common';

const TARGET = '原題提案';

/**
 * 原題提案エラーメッセージ
 */
export const TITLE_SUGGESTION_ERROR_MESSAGES = {
  /** バリデーションエラー */
  VALIDATION_ERROR: errorMessage.invalid('検索クエリ'),
  /** 取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
} as const;

/**
 * 原題提案設定
 */
export const TITLE_SUGGESTION = {
  /** TanStack Query staleTime（24時間） */
  STALE_TIME: 24 * 60 * 60 * 1000,
} as const;

/**
 * 原題提案UIメッセージ
 */
export const TITLE_SUGGESTION_MESSAGES = {
  /** 提案サフィックス */
  SUGGESTION_SUFFIX: 'ですか？',
} as const;
