/**
 * ウォッチリストボタン E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ（ボタン表示・aria-label確認は結合テストに移行済み）
 * API呼び出し→状態更新→UI反映、モーダル↔タイル間の状態同期を検証
 * afterEachで全件クリーンアップするため、テスト内で「元に戻す」操作は不要
 */

import { test, expect } from '../fixtures/auth';
import { cleanupWatchlist } from '../helpers/api';
import { movieTileButtons } from '../helpers/locators';

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

test.describe('ウォッチリストボタン — 状態トグル', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });
  });

  test.afterEach(async ({ request }) => {
    await cleanupWatchlist(request);
  });

  test('ウォッチリストボタンクリックでラベルが切り替わる', async ({ page }) => {
    const firstTile = movieTileButtons(page).first();
    const addButton = firstTile.getByRole('button', {
      name: 'ウォッチリストに追加',
    });
    const removeButton = firstTile.getByRole('button', {
      name: 'ウォッチリストから削除',
    });

    const wasAdded = await addButton.isVisible().catch(() => false);

    if (wasAdded) {
      const responsePromise = waitForWatchlistResponse(page);
      await addButton.click();
      await responsePromise;
      await expect(removeButton).toBeVisible({ timeout: 5000 });
    } else {
      const responsePromise = waitForWatchlistResponse(page);
      await removeButton.click();
      await responsePromise;
      await expect(addButton).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('ウォッチリストボタン — モーダル↔タイル状態同期', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });
  });

  test.afterEach(async ({ request }) => {
    await cleanupWatchlist(request);
  });

  test('モーダル内ウォッチリストボタンクリックでラベルが切り替わる', async ({
    page,
  }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    const addButton = dialog.getByRole('button', {
      name: 'ウォッチリストに追加',
    });
    const removeButton = dialog.getByRole('button', {
      name: 'ウォッチリストから削除',
    });

    const wasAdded = await addButton.isVisible().catch(() => false);

    if (wasAdded) {
      const responsePromise = waitForWatchlistResponse(page);
      await addButton.click();
      await responsePromise;
      await expect(removeButton).toBeVisible({ timeout: 5000 });
    } else {
      const responsePromise = waitForWatchlistResponse(page);
      await removeButton.click();
      await responsePromise;
      await expect(addButton).toBeVisible({ timeout: 5000 });
    }
  });

  test('モーダルでウォッチリスト操作後、タイル側のボタンも同期される', async ({
    page,
  }) => {
    const firstTile = movieTileButtons(page).first();

    const tileAddButton = firstTile.getByRole('button', {
      name: 'ウォッチリストに追加',
    });
    const tileRemoveButton = firstTile.getByRole('button', {
      name: 'ウォッチリストから削除',
    });
    const wasAdded = await tileAddButton.isVisible().catch(() => false);

    // モーダルを開く
    await firstTile.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    // モーダル内でトグル
    const modalButton = dialog.getByRole('button', {
      name: /ウォッチリスト/,
    });
    const responsePromise = waitForWatchlistResponse(page);
    await modalButton.click();
    await responsePromise;

    // モーダルを閉じる
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible();

    // タイル側のラベルが切り替わっていることを確認
    if (wasAdded) {
      await expect(tileRemoveButton).toBeVisible({ timeout: 5000 });
    } else {
      await expect(tileAddButton).toBeVisible({ timeout: 5000 });
    }
  });
});
