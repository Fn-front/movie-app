/**
 * ヘッダー E2Eテスト（認証済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('ヘッダー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ヘッダーが表示される', async ({ page }) => {
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('ロゴテキストが表示される', async ({ page }) => {
    const header = page.getByRole('banner');
    await expect(header.getByText('Movie App')).toBeVisible();
  });

  test('ロゴがリンクになっている', async ({ page }) => {
    const header = page.getByRole('banner');
    const logoLink = header.getByRole('link', { name: 'Movie App' });
    await expect(logoLink).toBeVisible();
    await expect(logoLink).toHaveAttribute('href', '/');
  });

  test('ヘッダーは各ページで共通して表示される', async ({ page }) => {
    // 公開予定ページ
    await page.goto('/movies/upcoming');
    await expect(page.getByRole('banner')).toBeVisible();

    // 公開中ページ
    await page.goto('/movies/now-showing');
    await expect(page.getByRole('banner')).toBeVisible();
  });
});
