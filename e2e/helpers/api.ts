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
  const response = await request.get('/api/watchlist');

  if (!response.ok()) return;

  const json = await response.json();
  const items = json.data?.watchlist ?? [];

  for (const item of items) {
    await request.delete(`/api/watchlist/${item.id}`);
  }
}

/**
 * テストユーザーのフィルター条件をデフォルト状態にリセットする
 */
export async function resetFilters(
  request: APIRequestContext,
): Promise<void> {
  await request.put('/api/filters', {
    data: {},
  });
}
