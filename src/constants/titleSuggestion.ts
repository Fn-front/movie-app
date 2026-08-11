/**
 * 原題提案機能の定数
 */

import { errorMessage } from './common';
import { MS_PER_DAY } from './time';

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
  STALE_TIME: MS_PER_DAY,
  /** sessionStorageキー: 提案クリック時に提案リストを保持 */
  STORAGE_KEY: 'title_suggestions',
  /** 原題候補の最大件数（LLMが超過して返した場合は切り詰める） */
  MAX_SUGGESTIONS: 5,
} as const;

/**
 * 原題提案UIメッセージ
 */
export const TITLE_SUGGESTION_MESSAGES = {
  /** 提案プレフィックス */
  SUGGESTION_PREFIX: 'もしかして:',
} as const;
