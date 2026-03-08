/**
 * ホームページ E2Eテスト（認証済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('ホームページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ページタイトルが正しく表示される', async ({ page }) => {
    await expect(page).toHaveTitle(/ホーム/);
  });

  test('ヘッダーが表示される', async ({ page }) => {
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('サイドナビが表示される', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: '映画ナビゲーション' });
    await expect(nav).toBeVisible();
  });

  test('フッターが表示される', async ({ page }) => {
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('ロゴリンクがホームに遷移する', async ({ page }) => {
    await page.goto('/movies/upcoming');
    await page.getByRole('link', { name: 'Movie App' }).click();

    await expect(page).toHaveURL('/');
  });
});
