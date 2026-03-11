/**
 * ユーザー関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * 設定エラーメッセージ
 */
export const SETTINGS_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed('設定'),
  UPDATE_FAILED: errorMessage.updateFailed('設定'),
} as const;

/**
 * 設定成功メッセージ
 */
export const SETTINGS_SUCCESS_MESSAGES = {
  UPDATED: successMessage.updated('設定'),
} as const;

/**
 * プロフィールエラーメッセージ
 */
export const PROFILE_ERROR_MESSAGES = {
  UPDATE_FAILED: errorMessage.updateFailed('表示名'),
} as const;

/**
 * プロフィール成功メッセージ
 */
export const PROFILE_SUCCESS_MESSAGES = {
  UPDATED: successMessage.updated('表示名'),
} as const;
