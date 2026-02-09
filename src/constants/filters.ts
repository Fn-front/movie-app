/**
 * フィルター関連の定数
 */

/**
 * フィルターエラーメッセージ
 */
export const FILTER_ERROR_MESSAGES = {
  /** バリデーションエラー */
  VALIDATION_ERROR: 'フィルター条件が不正です。',
  /** フィルター取得失敗 */
  FETCH_FAILED: 'フィルター条件の取得中にエラーが発生しました。',
  /** フィルター保存失敗 */
  SAVE_FAILED: 'フィルター条件の保存中にエラーが発生しました。',
} as const;
