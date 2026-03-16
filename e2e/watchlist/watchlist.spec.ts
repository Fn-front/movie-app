/**
 * ウォッチリストページ E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ
 * - ウォッチリストページ表示 → 映画詳細モーダル
 * - サイドバー「すべて見る」→ ウォッチリストページ遷移
 * afterEachで全件クリーンアップするため、テスト内で「元に戻す」操作は不要
 * 同一ユーザーのウォッチリストを操作するため、シリアル実行
 */

import { test, expect } from '../fixtures/auth';
import { cleanupWatchlist } from '../helpers/api';
import { movieTileButtons } from '../helpers/locators';

test.describe.configure({ mode: 'serial' });

/** ウォッチリストAPIレスポンスを待つ */
function waitForWatchlistResponse(page: import('@playwright/test').Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes('/api/watchlist') &&
      (res.request().method() === 'POST' ||
        res.request().method() === 'DELETE') &&
      res.status() < 500,
  );
}

/** 映画をウォッチリストに追加する（前準備用） */
async function addMovieToWatchlist(page: import('@playwright/test').Page) {
  await page.goto('/movies/now-showing');
  await movieTileButtons(page).first().waitFor({ timeout: 30000 });

  const firstTile = movieTileButtons(page).first();
  const addButton = firstTile.getByRole('button', {
    name: 'ウォッチリストに追加',
  });

  // 既に追加済みの場合はスキップ
  const isAddVisible = await addButton.isVisible().catch(() => false);
  if (isAddVisible) {
    const responsePromise = waitForWatchlistResponse(page);
    await addButton.click();
    await responsePromise;
  }
}

test.describe('ウォッチリスト — ページ表示・詳細モーダル', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupWatchlist();
    await addMovieToWatchlist(page);
  });

  test.afterEach(async () => {
    await cleanupWatchlist();
  });

  test('ウォッチリストページに映画が表示され、クリックで詳細モーダルが開く', async ({
    page,
  }) => {
    await page.goto('/watchlist');
    await expect(
      page.getByRole('heading', { name: 'ウォッチリスト' }),
    ).toBeVisible({ timeout: 15000 });

    // ウォッチリストに映画が表示されている
    const detailButton = page
      .locator('[class*="c_watchlist_tile"][role="button"]')
      .first();
    await expect(detailButton).toBeVisible({ timeout: 10000 });

    // タイルクリックで詳細モーダルが開く
    await detailButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    // モーダルを閉じる
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('ウォッチリストページで削除すると映画が消える', async ({ page }) => {
    await page.goto('/watchlist');
    await expect(
      page.getByRole('heading', { name: 'ウォッチリスト' }),
    ).toBeVisible({ timeout: 15000 });

    // 削除ボタンをクリック
    const deleteButton = page
      .getByRole('button', { name: /をウォッチリストから削除/ })
      .first();
    await expect(deleteButton).toBeVisible({ timeout: 10000 });

    const responsePromise = waitForWatchlistResponse(page);
    await deleteButton.click();
    await responsePromise;

    // 空状態メッセージが表示される
    await expect(
      page.getByText('ウォッチリストに映画を追加しましょう'),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('ウォッチリスト — サイドバー「すべて見る」遷移', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupWatchlist();
    await addMovieToWatchlist(page);
  });

  test.afterEach(async () => {
    await cleanupWatchlist();
  });

  test('サイドバーの「すべて見る」クリックでウォッチリストページに遷移する', async ({
    page,
  }) => {
    // サイドバーが表示されるページに遷移
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });

    // サイドバーに「すべて見る」リンクが表示される
    const showAllLink = page.getByRole('link', { name: 'すべて見る' });
    await expect(showAllLink).toBeVisible({ timeout: 15000 });

    // クリックでウォッチリストページに遷移
    await showAllLink.click();
    await page.waitForURL('/watchlist');

    // ウォッチリストページが表示される
    await expect(
      page.getByRole('heading', { name: 'ウォッチリスト' }),
    ).toBeVisible({ timeout: 15000 });
  });
});
