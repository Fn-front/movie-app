/**
 * 映画ページ ソート・フィルター操作 E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ（クリアボタン動作は結合テストに移行済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('公開予定ページのソート・フィルター操作', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/upcoming');
    // 映画データまたは空メッセージの表示を待つ
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });
  });

  test('ソートを変更できる', async ({ page }) => {
    const sortSelect = page.getByRole('combobox');
    await expect(sortSelect).toBeVisible();

    await sortSelect.click();
    await page.getByRole('option', { name: '人気順' }).click();

    // ソート変更後もページが正常に表示される
    await expect(
      page
        .locator('[class*="movie_tile"]')
        .first()
        .or(page.getByText(/映画が見つかりませんでした/)),
    ).toBeVisible();
  });

  test('フィルターモーダルでジャンルを選択して適用できる', async ({ page }) => {
    await page.getByRole('button', { name: /フィルター/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ジャンルのチェックボックスが存在する場合にクリック
    const genreCheckbox = dialog.getByRole('checkbox').first();
    const hasGenres = (await genreCheckbox.count()) > 0;

    if (hasGenres) {
      await genreCheckbox.click();
    }

    await dialog.getByRole('button', { name: '適用' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('リリースタイプタブを切り替えられる', async ({ page }) => {
    const streamingTab = page.getByRole('tab', { name: 'ストリーミング' });
    await expect(streamingTab).toBeVisible();

    await streamingTab.click();

    // タブ切り替え後もページが正常に表示される
    await expect(
      page
        .locator('[class*="movie_tile"]')
        .first()
        .or(page.getByText(/表示する映画がありません/)),
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe('公開中ページのソート・フィルター操作', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/now-showing');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });
  });

  test('ソートを変更できる', async ({ page }) => {
    const sortSelect = page.getByRole('combobox');
    await sortSelect.click();
    await page.getByRole('option', { name: '評価順' }).click();

    await expect(
      page
        .locator('[class*="movie_tile"]')
        .first()
        .or(page.getByText(/映画が見つかりませんでした/)),
    ).toBeVisible();
  });

  test('フィルターモーダルでジャンルを選択して適用できる', async ({ page }) => {
    await page.getByRole('button', { name: /フィルター/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const genreCheckbox = dialog.getByRole('checkbox').first();
    const hasGenres = (await genreCheckbox.count()) > 0;

    if (hasGenres) {
      await genreCheckbox.click();
    }

    await dialog.getByRole('button', { name: '適用' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
