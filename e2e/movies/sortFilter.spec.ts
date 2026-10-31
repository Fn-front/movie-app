/**
 * 映画ページ ソート・フィルター操作 E2Eテスト（認証済み）
 * クリティカルユーザージャーニーのみ（クリアボタン動作は結合テストに移行済み）
 * UI操作の動作確認のみのため、フィルターリセットは不要
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

    // ソート変更後もページが正常に表示される（キャッシュヒット時はAPI呼び出しなし）
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

    // ジャンル欄を見出しで特定する。dialog 直下の最初のチェックボックスは
    // 地域フィルタのものになるため、セクションを限定しないと別物を掴む
    const genreSection = dialog
      .locator('div[class*="c_filter__section"]')
      .filter({ has: page.getByRole('heading', { name: 'ジャンル' }) });
    const genreTag = genreSection.locator('label[class*="c_filter__tag"]');

    // 入力は視覚的に隠してあり、利用者はラベルをクリックして切り替える。
    // 入力自体をクリックするとラベルが pointer events を奪って失敗する
    if ((await genreTag.count()) > 0) {
      await genreTag.first().click();
      await expect(genreSection.getByRole('checkbox').first()).toBeChecked();
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

    // ソート変更後もページが正常に表示される（キャッシュヒット時はAPI呼び出しなし）
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

    // 上と同じ理由でセクションを限定し、ラベルをクリックする
    const genreSection = dialog
      .locator('div[class*="c_filter__section"]')
      .filter({ has: page.getByRole('heading', { name: 'ジャンル' }) });
    const genreTag = genreSection.locator('label[class*="c_filter__tag"]');

    if ((await genreTag.count()) > 0) {
      await genreTag.first().click();
      await expect(genreSection.getByRole('checkbox').first()).toBeChecked();
    }

    await dialog.getByRole('button', { name: '適用' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
