/**
 * 公開予定ページ E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ（UI表示・フィルターモーダル開閉は結合テストに移行済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('公開予定ページ — 無限スクロール', () => {
  test('スクロールで追加データが読み込まれる', async ({ page }) => {
    // page > 1 のリクエストを一旦保留してキューに溜める
    const pendingRequests: Array<{
      route: import('@playwright/test').Route;
    }> = [];

    await page.route('**/api/movies**', async (route) => {
      const url = route.request().url();
      const pageMatch = url.match(/page=(\d+)/);
      const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;

      if (pageNum > 1) {
        pendingRequests.push({ route });
        return;
      }
      await route.continue();
    });

    await page.goto('/movies/upcoming');

    const movieTiles = page.locator('[class*="movie_tile"]');
    await movieTiles.first().waitFor({ timeout: 15000 });

    const firstCount = await movieTiles.count();

    // 映画が20件未満 or ペンディングリクエストがない場合はスキップ
    if (firstCount < 20 || pendingRequests.length === 0) {
      // 保留中リクエストを解放してからスキップ
      for (const req of pendingRequests) {
        await req.route.continue();
      }
      await page.unroute('**/api/movies**');
      test.skip();
      return;
    }

    // ルートインターセプトを解除し、保留中リクエストを解放
    await page.unroute('**/api/movies**');
    for (const req of pendingRequests) {
      await req.route.continue();
    }

    // sentinel要素までスクロールして追加読み込みを発火
    const sentinel = page.locator('[class*="movie_list__sentinel"]');
    await sentinel.scrollIntoViewIfNeeded();

    // タイル数が増えるのを待つ
    await expect(async () => {
      const newCount = await movieTiles.count();
      expect(newCount).toBeGreaterThan(firstCount);
    }).toPass({ timeout: 15000 });
  });
});
