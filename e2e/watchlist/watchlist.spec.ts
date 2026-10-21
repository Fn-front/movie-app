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
import { movieTiles } from '../helpers/locators';
import { mockMovieDetail } from '../helpers/movieDetail';

// 同一ユーザーのウォッチリストを直列操作。並列負荷下でも goto＋タイル待ち＋
// API応答（前準備の beforeEach 含む）が予算切れしないよう、テストタイムアウトを延長する
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** ウォッチリストAPIレスポンスを待つ */
function waitForWatchlistResponse(page: import('@playwright/test').Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes('/api/watchlist') &&
      (res.request().method() === 'POST' ||
        res.request().method() === 'DELETE') &&
      res.status() < 500,
    { timeout: 30000 },
  );
}

/** 映画をウォッチリストに追加する（前準備用） */
async function addMovieToWatchlist(page: import('@playwright/test').Page) {
  await page.goto('/movies/now-showing');
  await movieTiles(page).first().waitFor({ timeout: 30000 });

  const firstTile = movieTiles(page).first();
  const addButton = firstTile.getByRole('button', {
    name: 'ウォッチリストに追加',
  });
  const removeButton = firstTile.getByRole('button', {
    name: 'ウォッチリストから削除',
  });

  // ボタンがレンダリングされるまで待機
  await expect(addButton.or(removeButton)).toBeVisible({ timeout: 10000 });

  // 既に追加済みの場合はスキップ
  const isAddVisible = await addButton.isVisible().catch(() => false);
  if (isAddVisible) {
    const responsePromise = waitForWatchlistResponse(page);
    await addButton.click();
    await responsePromise;
    // 追加完了を確認
    await expect(removeButton).toBeVisible({ timeout: 10000 });
  }
}

test.describe('ウォッチリスト — ページ表示・詳細モーダル', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupWatchlist();
    await mockMovieDetail(page);
    await addMovieToWatchlist(page);
  });

  test.afterEach(async () => {
    await cleanupWatchlist();
  });

  test('ウォッチリストページに映画が表示され、クリックで詳細モーダルが開く', async ({
    page,
  }) => {
    // ウォッチリストデータ取得完了を待ってからページを表示
    const dataPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/watchlist') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
    );
    await page.goto('/watchlist');
    await dataPromise;
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
    // ウォッチリストデータ取得完了を待ってからページを表示
    const dataPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/watchlist') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
    );
    await page.goto('/watchlist');
    await dataPromise;
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
    await movieTiles(page).first().waitFor({ timeout: 30000 });

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

/**
 * お気に入りの評価モーダル。
 * 未登録なら「お気に入りに追加」、登録済みなら「お気に入りを編集」で開くため、
 * どちらにも当たる形で取る（共有テストユーザーの登録状況に依存させない）
 */
function favoriteRatingModal(page: import('@playwright/test').Page) {
  return page.getByRole('dialog', { name: /お気に入り(に追加|を編集)/ });
}

test.describe('ウォッチリスト — 視聴済み', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupWatchlist();
    await addMovieToWatchlist(page);
  });

  test.afterEach(async () => {
    await cleanupWatchlist();
  });

  test('視聴済みにすると評価モーダルが開き、閉じても視聴済みが残る', async ({
    page,
  }) => {
    await page.goto('/watchlist');

    const watchedButton = page
      .getByRole('button', { name: /を視聴済みにする$/ })
      .first();
    await expect(watchedButton).toBeVisible({ timeout: 30000 });

    const patchResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/watchlist/') &&
        res.request().method() === 'PATCH',
      { timeout: 30000 },
    );
    await watchedButton.click();
    await patchResponse;

    // お気に入りの評価モーダルが開く
    const ratingModal = favoriteRatingModal(page);
    await expect(ratingModal).toBeVisible({ timeout: 15000 });

    // 登録せずに閉じても視聴済みは残る
    await ratingModal.getByRole('button', { name: 'キャンセル' }).click();
    await expect(ratingModal).not.toBeVisible();

    await expect(page.getByText('視聴済み')).toBeVisible({ timeout: 15000 });

    // リロードしても維持される
    await page.reload();
    await expect(page.getByText('視聴済み')).toBeVisible({ timeout: 30000 });
  });

  test('視聴済みはサイドバーと公開カレンダーから消える', async ({ page }) => {
    await page.goto('/watchlist');

    const watchedButton = page
      .getByRole('button', { name: /を視聴済みにする$/ })
      .first();
    await expect(watchedButton).toBeVisible({ timeout: 30000 });

    // 対象のタイトルを控えてから視聴済みにする
    const label = await watchedButton.getAttribute('aria-label');
    const title = (label ?? '').replace(/を視聴済みにする$/, '');

    const patchResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/watchlist/') &&
        res.request().method() === 'PATCH',
      { timeout: 30000 },
    );
    await watchedButton.click();
    await patchResponse;

    await favoriteRatingModal(page)
      .getByRole('button', { name: 'キャンセル' })
      .click();

    // サイドバーの「公開日が近い映画」から消える
    const sidebar = page.getByRole('complementary');
    await expect(
      sidebar.getByRole('button', { name: title, exact: true }),
    ).toHaveCount(0, { timeout: 15000 });

    // 公開カレンダーからも消える
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();
    const calendar = page.getByRole('dialog', { name: '公開カレンダー' });
    await expect(calendar.getByText('読み込み中...')).not.toBeVisible({
      timeout: 15000,
    });
    await expect(calendar.getByText(title, { exact: true })).toHaveCount(0);
  });

  test('視聴済みを解除すると元に戻る', async ({ page }) => {
    await page.goto('/watchlist');

    const watchedButton = page
      .getByRole('button', { name: /を視聴済みにする$/ })
      .first();
    await expect(watchedButton).toBeVisible({ timeout: 30000 });

    const markResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/watchlist/') &&
        res.request().method() === 'PATCH',
      { timeout: 30000 },
    );
    await watchedButton.click();
    await markResponse;

    await favoriteRatingModal(page)
      .getByRole('button', { name: 'キャンセル' })
      .click();

    const unmarkButton = page
      .getByRole('button', { name: /を未視聴に戻す$/ })
      .first();
    await expect(unmarkButton).toBeVisible({ timeout: 15000 });

    const unmarkResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/watchlist/') &&
        res.request().method() === 'PATCH',
      { timeout: 30000 },
    );
    await unmarkButton.click();
    await unmarkResponse;

    // バッジが消え、視聴済みボタンに戻る
    await expect(page.getByText('視聴済み')).toHaveCount(0, { timeout: 15000 });
    await expect(
      page.getByRole('button', { name: /を視聴済みにする$/ }).first(),
    ).toBeVisible();
  });
});
