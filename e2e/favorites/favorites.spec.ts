/**
 * お気に入り E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ
 * - MovieTileからお気に入り追加（評価選択 → 登録）→ ハートアイコン変化
 * - お気に入り一覧ページで表示確認 → 評価変更 → 削除
 * - 詳細モーダルからお気に入り追加/削除
 * afterEachで全件クリーンアップするため、テスト内で「元に戻す」操作は不要
 * 同一ユーザーのお気に入りを操作するため、シリアル実行
 */

import { test, expect } from '../fixtures/auth';
import { cleanupFavorites } from '../helpers/api';
import { movieTileButtons } from '../helpers/locators';
import { mockMovieDetail } from '../helpers/movieDetail';

test.describe.configure({ mode: 'serial' });

/** お気に入りAPIレスポンスを待つ */
function waitForFavoritesResponse(page: import('@playwright/test').Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes('/api/favorites') &&
      (res.request().method() === 'POST' ||
        res.request().method() === 'PATCH' ||
        res.request().method() === 'DELETE') &&
      res.status() < 500,
  );
}

test.describe('お気に入り — MovieTileから追加', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupFavorites();
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });
  });

  test.afterEach(async () => {
    await cleanupFavorites();
  });

  test('MovieTileのお気に入りボタンから追加するとハートアイコンが変化する', async ({
    page,
  }) => {
    const firstTile = movieTileButtons(page).first();
    const addButton = firstTile.getByRole('button', {
      name: 'お気に入りに追加',
    });

    // お気に入りボタンをクリック → モーダルが開く
    await addButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'お気に入りに追加' }),
    ).toBeVisible();

    // 評価を選択して登録
    await dialog.getByRole('radio', { name: '8点' }).click();
    const responsePromise = waitForFavoritesResponse(page);
    await dialog.getByRole('button', { name: '登録' }).click();
    await responsePromise;

    // モーダルが閉じ、ハートアイコンが「編集」に変化
    await expect(dialog).not.toBeVisible();
    await expect(
      firstTile.getByRole('button', { name: 'お気に入りを編集' }),
    ).toBeVisible();
  });
});

test.describe('お気に入り — 一覧ページ', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupFavorites();

    // まず映画をお気に入りに追加する
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });

    const firstTile = movieTileButtons(page).first();
    await firstTile.getByRole('button', { name: 'お気に入りに追加' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: '7点' }).click();
    const responsePromise = waitForFavoritesResponse(page);
    await dialog.getByRole('button', { name: '登録' }).click();
    await responsePromise;
    await expect(dialog).not.toBeVisible();
  });

  test.afterEach(async () => {
    await cleanupFavorites();
  });

  test('お気に入り一覧ページで表示確認 → 評価変更 → 削除', async ({ page }) => {
    // お気に入りデータ取得完了を待ってからページを表示
    const dataPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/favorites') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
    );
    await page.goto('/favorites');
    await dataPromise;
    await expect(page.getByRole('heading', { name: 'お気に入り' })).toBeVisible(
      { timeout: 15000 },
    );

    // お気に入りが表示されている
    const editButton = page
      .getByRole('button', { name: 'お気に入りを編集' })
      .first();
    await expect(editButton).toBeVisible();

    // 評価変更：ハートボタンクリック → モーダル → 評価変更 → 更新
    await editButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'お気に入りを編集' }),
    ).toBeVisible();

    await dialog.getByRole('radio', { name: '9点' }).click();
    const updatePromise = waitForFavoritesResponse(page);
    await dialog.getByRole('button', { name: '更新' }).click();
    await updatePromise;
    await expect(dialog).not.toBeVisible();

    // 削除：再度ハートボタンクリック → モーダル → 削除
    await expect(editButton).toBeVisible();
    await editButton.click();
    await expect(dialog).toBeVisible();

    const deletePromise = waitForFavoritesResponse(page);
    await dialog.getByRole('button', { name: '削除' }).click();
    await deletePromise;
    await expect(dialog).not.toBeVisible();

    // 空状態メッセージが表示される
    await expect(
      page.getByText('お気に入りの映画を追加しましょう'),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('お気に入り — 詳細モーダルとの連携', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupFavorites();
    await mockMovieDetail(page);
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });
  });

  test.afterEach(async () => {
    await cleanupFavorites();
  });

  test('詳細モーダルにお気に入りボタンが表示され、MovieTileの状態と連動する', async ({
    page,
  }) => {
    // 詳細モーダルで「お気に入りに追加」ボタンが存在することを確認
    await movieTileButtons(page).first().click();
    const detailDialog = page.getByRole('dialog');
    await expect(detailDialog).toBeVisible({ timeout: 15000 });
    await expect(detailDialog.getByText('詳細情報')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      detailDialog.getByRole('button', { name: 'お気に入りに追加' }),
    ).toBeVisible();

    // 詳細モーダルを閉じる
    await detailDialog.getByRole('button', { name: '閉じる' }).click();
    await expect(detailDialog).not.toBeVisible();

    // MovieTileからお気に入りに追加
    const firstTile = movieTileButtons(page).first();
    const addButton = firstTile.getByRole('button', {
      name: 'お気に入りに追加',
    });
    await addButton.click();
    const ratingDialog = page.getByRole('dialog');
    await expect(ratingDialog).toBeVisible();
    await ratingDialog.getByRole('radio', { name: '6点' }).click();
    await ratingDialog.getByRole('button', { name: '登録' }).click();

    // 楽観的更新でMovieTileのボタンが「お気に入りを編集」に変化することを確認
    await expect(
      firstTile.getByRole('button', { name: 'お気に入りを編集' }),
    ).toBeVisible();
  });
});
