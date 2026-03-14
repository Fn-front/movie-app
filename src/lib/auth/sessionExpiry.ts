/**
 * セッション絶対有効期限チェック
 */

import { SESSION_CONFIG } from '@/constants';

/**
 * セッションが絶対有効期限を超過しているかチェックする
 *
 * @param issuedAt - トークン発行時刻（Date.now()のタイムスタンプ）
 * @param now - 現在時刻（テスト用に注入可能、デフォルトはDate.now()）
 * @returns 期限超過の場合 true
 */
export function isSessionExpired(
  issuedAt: number | undefined,
  now: number = Date.now(),
): boolean {
  if (!issuedAt) return false;

  const elapsed = now - issuedAt;
  return elapsed > SESSION_CONFIG.ABSOLUTE_MAX_AGE_MS;
}
