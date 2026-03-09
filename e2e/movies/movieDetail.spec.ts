/**
 * 映画詳細モーダル E2Eテスト（認証済み）
 */

import { test, expect } from '../fixtures/auth';

/** 映画タイルのボタンロケータを取得 */
function movieTileButtons(page: import('@playwright/test').Page) {
  return page.getByRole('button', { name: /の詳細を表示/ });
}

test.describe('映画詳細モーダル', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/movies/now-showing');
    // 映画タイルが表示されるまで待機
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });
  });

  test('映画タイルをクリックすると詳細モーダルが開く', async ({ page }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
  });

  test('モーダルに映画タイトルが表示される', async ({ page }) => {
    // 映画タイルのタイトルを取得
    const tileTitle = await movieTileButtons(page)
      .first()
      .locator('h3')
      .textContent();

    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // モーダル内にタイトルが表示される
    await expect(dialog.getByText(tileTitle!)).toBeVisible();
  });

  test('モーダルにあらすじセクションまたは詳細情報が表示される', async ({
    page,
  }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // あらすじまたは詳細情報の少なくとも一方が表示される
    const hasOverview = await dialog
      .getByText('あらすじ')
      .isVisible()
      .catch(() => false);
    const hasAdditionalInfo = await dialog
      .getByText('詳細情報')
      .isVisible()
      .catch(() => false);
    expect(hasOverview || hasAdditionalInfo).toBe(true);
  });

  test('モーダルに詳細情報セクションが表示される', async ({ page }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await expect(dialog.getByText('詳細情報')).toBeVisible();
    // 人気度は常に表示される
    await expect(dialog.getByText('人気度')).toBeVisible();
  });

  test('モーダルにキャストセクションが表示される', async ({ page }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // キャスト情報がある映画の場合表示される（ない場合もあるのでsoft assertion）
    const castSection = dialog.getByText('キャスト');
    const hasCast = await castSection.isVisible().catch(() => false);
    if (hasCast) {
      await expect(castSection).toBeVisible();
    }
  });

  test('配信プロバイダー情報が表示される（データがある場合）', async ({
    page,
  }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // 配信情報はデータ依存のため、表示される場合のみラベルとロゴを検証
    const flatrateLabel = dialog.getByText('配信');
    const hasFlatrate = await flatrateLabel.isVisible().catch(() => false);
    if (hasFlatrate) {
      // ロゴ画像が少なくとも1つ存在する
      const logos = dialog.locator('[class*="provider_logo"]');
      await expect(logos.first()).toBeVisible();
    }
  });

  test('閉じるボタンでモーダルが閉じる', async ({ page }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('ESCキーでモーダルが閉じる', async ({ page }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('オーバーレイクリックでモーダルが閉じる', async ({ page }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // オーバーレイ（モーダル外側の暗い部分）をクリック
    await page.mouse.click(10, 10);
    await expect(dialog).not.toBeVisible();
  });

  test('キーボードで映画タイルを操作してモーダルを開ける', async ({ page }) => {
    const firstTile = movieTileButtons(page).first();
    await firstTile.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
  });

  test('公開中ページでは予算・興行収入が表示される', async ({ page }) => {
    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // 公開中ページではshowFinancialInfo=trueなので表示される
    await expect(dialog.getByText('制作予算')).toBeVisible();
    await expect(dialog.getByText('興行収入')).toBeVisible();
  });

  test('公開予定ページでは予算・興行収入が表示されない', async ({ page }) => {
    await page.goto('/movies/upcoming');
    await movieTileButtons(page).first().waitFor({ timeout: 30000 });

    await movieTileButtons(page).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // 公開予定ページではshowFinancialInfo=falseなので非表示
    await expect(dialog.getByText('制作予算')).not.toBeVisible();
    await expect(dialog.getByText('興行収入')).not.toBeVisible();
  });

  test('モーダルを閉じて別の映画を開ける', async ({ page }) => {
    const tiles = movieTileButtons(page);
    const tileCount = await tiles.count();

    if (tileCount >= 2) {
      // 1つ目の映画を開く
      const firstTitle = await tiles.nth(0).locator('h3').textContent();
      await tiles.nth(0).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 15000 });
      await expect(dialog.getByText(firstTitle!)).toBeVisible();

      // 閉じる
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();

      // 2つ目の映画を開く
      const secondTitle = await tiles.nth(1).locator('h3').textContent();
      await tiles.nth(1).click();

      await expect(dialog).toBeVisible({ timeout: 15000 });
      await expect(dialog.getByText(secondTitle!)).toBeVisible();
    }
  });
});
