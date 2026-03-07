/**
 * 公開中ページ E2Eテスト（認証済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('公開中ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/now-showing');
  });

  test('ページタイトルが正しく表示される', async ({ page }) => {
    await expect(page).toHaveTitle(/公開中/);
  });

  test('ソートセレクトが表示される', async ({ page }) => {
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  test('フィルターボタンが表示される', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /フィルター/ }),
    ).toBeVisible();
  });

  test('映画タイルまたは空メッセージが表示される', async ({ page }) => {
    const movieTile = page.locator('[class*="movie_tile"]').first();
    const emptyMessage = page.getByText(/映画が見つかりませんでした/);

    await expect(movieTile.or(emptyMessage)).toBeVisible();
  });

  test('フィルターモーダルが開閉できる', async ({ page }) => {
    await page.getByRole('button', { name: /フィルター/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
});
