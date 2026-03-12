/**
 * 検索関連の定数
 */

import { errorMessage } from './common';

const TARGET = '検索';

/**
 * 検索エラーメッセージ
 */
export const SEARCH_ERROR_MESSAGES = {
  /** バリデーションエラー */
  VALIDATION_ERROR: errorMessage.invalid('検索パラメータ'),
  /** 検索条件なし */
  NO_SEARCH_CRITERIA: '検索キーワードまたはフィルター条件を指定してください',
  /** 検索結果取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  /** ジャンル一覧取得失敗 */
  GENRES_FETCH_FAILED: errorMessage.fetchFailed('ジャンル一覧'),
} as const;

/**
 * 検索パラメータのバリデーション定数
 */
export const SEARCH_VALIDATION = {
  /** 評価の最小値 */
  VOTE_AVERAGE_MIN: 0,
  /** 評価の最大値 */
  VOTE_AVERAGE_MAX: 10,
  /** 年代の最小値 */
  YEAR_MIN: 1900,
} as const;
