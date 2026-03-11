/**
 * 公開予定ページ E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ（UI表示・フィルターモーダル開閉は結合テストに移行済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('公開予定ページ — 無限スクロール', () => {
  test('スクロールで追加データが読み込まれる', async ({ page }) => {
    await page.goto('/movies/upcoming');

    const movieTiles = page.locator('[class*="movie_tile"]');
    await movieTiles.first().waitFor({ timeout: 15000 });

    const firstCount = await movieTiles.count();

    // 映画が20件以上ある場合のみ無限スクロールをテスト
    if (firstCount >= 20) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // タイル数が増えるまで自動リトライで待機
      await expect(async () => {
        const newCount = await movieTiles.count();
        expect(newCount).toBeGreaterThan(firstCount);
      }).toPass({ timeout: 10000 });
    }
  });
});
