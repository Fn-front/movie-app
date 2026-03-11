/**
 * E2Eテスト用APIヘルパー
 * テストデータのクリーンアップに使用
 */

import type { APIRequestContext } from '@playwright/test';

/**
 * テストユーザーのウォッチリストを全件削除する
 */
export async function cleanupWatchlist(
  request: APIRequestContext,
): Promise<void> {
  // ウォッチリスト全件取得
  const response = await request.get('/api/watchlist');

  if (!response.ok()) return;

  const json = await response.json();
  const items = json.data?.watchlist ?? [];

  // 各アイテムを削除
  for (const item of items) {
    await request.delete(`/api/watchlist/${item.id}`);
  }
}
