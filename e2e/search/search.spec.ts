/**
 * 検索 E2Eテスト（公開・未認証）
 *
 * ユーザーストーリー網羅:
 * - 正常系: ヘッダーから検索 → 結果一覧表示
 * - 詳細遷移: 検索結果クリック → 詳細モーダル
 * - 空状態: 該当なし → 「検索結果が見つかりませんでした」
 */

import { test, expect } from '@playwright/test';

test.describe('検索（公開）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('ヘッダーから検索すると結果一覧が表示される', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('映画を検索').fill('バットマン');
    await page.getByLabel('映画を検索').press('Enter');

    await page.waitForURL(/\/search\?query=/);
    await expect(
      page.getByRole('heading', { name: '「バットマン」の検索結果' }),
    ).toBeVisible();
    await expect(page.locator('[class*="movie_tile"]').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('検索結果をクリックすると詳細モーダルが開く', async ({ page }) => {
    await page.goto('/search?query=バットマン');

    const firstTile = page
      .locator('[class*="movie_tile"][role="button"]')
      .first();
    await firstTile.waitFor({ timeout: 15000 });
    await firstTile.click();

    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('該当なしのキーワードで空状態が表示される', async ({ page }) => {
    await page.goto('/search?query=zzzqqxyz存在しない映画123');

    await expect(page.getByText('検索結果が見つかりませんでした')).toBeVisible({
      timeout: 15000,
    });
  });
});
