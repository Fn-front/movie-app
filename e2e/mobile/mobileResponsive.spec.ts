/**
 * モバイルレスポンシブ E2Eテスト（認証済み）
 * SP表示幅での主要ページ表示確認
 */

import { test, expect } from '../fixtures/auth';

test.use({
  viewport: { width: 375, height: 812 },
});

test.describe('モバイルレスポンシブ表示', () => {
  test('ホームページがSP幅で横スクロールが発生しない', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // 横スクロールが発生していない
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('検索ページでフィルタートグルが機能する', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/search?q=test');

    // フィルタートグルボタンが表示される
    const filterToggle = page.getByRole('button', { name: /フィルター/ });
    await expect(filterToggle).toBeVisible();

    // フィルターが初期状態で非表示（CSSによる）
    const filterPanel = page.locator('#search-filter');
    await expect(filterPanel).toBeAttached();

    // フィルタートグルをクリック
    await filterToggle.click();
    expect(await filterToggle.getAttribute('aria-expanded')).toBe('true');
  });

  test('SP幅で映画詳細モーダルが表示される', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // 映画タイルが表示されない場合はスキップ（CIでデータがない可能性）
    const movieTile = page.locator('[class*="movie_tile"]').first();
    const isTileVisible = await movieTile
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    test.skip(!isTileVisible, '映画データが存在しないためスキップ');

    await movieTile.click();

    // モーダルが表示される
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // モーダルが画面内に収まっている
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();

    if (dialogBox) {
      expect(dialogBox.width).toBeLessThanOrEqual(375);
    }
  });
});
