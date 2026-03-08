/**
 * フッター・TMDbアトリビューション E2Eテスト（認証済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('フッター', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('フッターが表示される', async ({ page }) => {
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('コピーライトが表示される', async ({ page }) => {
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByText(/© \d{4} Movie App/)).toBeVisible();
  });

  test('TMDbロゴが表示される', async ({ page }) => {
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByAltText('TMDB')).toBeVisible();
  });

  test('TMDbアトリビューション文言が表示される', async ({ page }) => {
    const footer = page.getByRole('contentinfo');
    await expect(
      footer.getByText(
        /This product uses the TMDB API but is not endorsed or certified by TMDB/,
      ),
    ).toBeVisible();
  });
});
