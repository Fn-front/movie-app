/**
 * ウォッチリストボタン E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ（ボタン表示・aria-label確認は結合テストに移行済み）
 * API呼び出し→状態更新→UI反映、モーダル↔タイル間の状態同期を検証
 */

import { test, expect } from '../fixtures/auth';
import { movieTileButtons } from '../helpers/locators';

test.describe('ウォッチリストボタン — 状態トグル', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });
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
      // 追加 → 削除
      await addButton.click();
      await expect(removeButton).toBeVisible({ timeout: 5000 });

      // 元に戻す
      await removeButton.click();
      await expect(addButton).toBeVisible({ timeout: 5000 });
    } else {
      // 削除 → 追加
      await removeButton.click();
      await expect(addButton).toBeVisible({ timeout: 5000 });

      // 元に戻す
      await addButton.click();
      await expect(removeButton).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('ウォッチリストボタン — モーダル↔タイル状態同期', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/now-showing');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });
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
      await addButton.click();
      await expect(removeButton).toBeVisible({ timeout: 5000 });

      // 元に戻す
      await removeButton.click();
      await expect(addButton).toBeVisible({ timeout: 5000 });
    } else {
      await removeButton.click();
      await expect(addButton).toBeVisible({ timeout: 5000 });

      // 元に戻す
      await addButton.click();
      await expect(removeButton).toBeVisible({ timeout: 5000 });
    }
  });

  test('モーダルでウォッチリスト追加後、タイル側のボタンも同期される', async ({
    page,
  }) => {
    const firstTile = movieTileButtons(page).first();

    // タイル上のウォッチリストボタンの初期状態を確認
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
    await modalButton.click();

    // モーダルを閉じる（閉じるボタンを使用 — Escapeはフォーカス位置で効かない場合がある）
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible();

    // タイル側のラベルが切り替わっていることを確認
    if (wasAdded) {
      await expect(tileRemoveButton).toBeVisible({ timeout: 5000 });
      // 元に戻す
      await tileRemoveButton.click();
    } else {
      await expect(tileAddButton).toBeVisible({ timeout: 5000 });
      // 元に戻す
      await tileAddButton.click();
    }
  });
});
