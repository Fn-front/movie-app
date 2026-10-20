/**
 * オーバーレイ展開時のアクセシビリティ回帰テスト
 *
 * ページを開いただけでは検査されない、モーダル・ドロワー等を
 * 展開した状態で axe-core を実行する。
 */

import { test, expect } from '@playwright/test';

import { THEMES, gotoWithTheme, expectNoA11yViolations } from './helpers';

test.describe('アクセシビリティ（オーバーレイ・未認証）', () => {
  test.describe.configure({ timeout: 60000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  for (const theme of THEMES) {
    test(`ログイン誘導モーダル - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/movies/now-showing', theme);

      // 未認証で保護ルートのリンクを押すとログイン誘導が開く
      await page.getByRole('link', { name: 'お気に入り' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await expectNoA11yViolations(page, `ログイン誘導モーダル / ${theme}`);
    });

    test(`モバイルドロワー - ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoWithTheme(page, '/movies/now-showing', theme);

      await page.getByRole('button', { name: 'メニュー' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await expectNoA11yViolations(page, `モバイルドロワー / ${theme}`);
    });

    test(`フィルターモーダル - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/movies/now-showing', theme);

      await page.getByRole('button', { name: /フィルター/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await expectNoA11yViolations(page, `フィルターモーダル / ${theme}`);
    });
  }
});

/**
 * 認証が要るオーバーレイ。
 * 公開カレンダーはログイン後しか開けないため、未認証の describe とは分ける。
 */
test.describe('アクセシビリティ（オーバーレイ・認証済み）', () => {
  test.describe.configure({ timeout: 60000 });

  for (const theme of THEMES) {
    test(`公開カレンダー - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/', theme);

      await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

      const dialog = page.getByRole('dialog', { name: '公開カレンダー' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
        timeout: 10000,
      });

      await expectNoA11yViolations(page, `公開カレンダー / ${theme}`);
    });

    test(`公開カレンダー（日付選択後） - ${theme}`, async ({ page }) => {
      await gotoWithTheme(page, '/', theme);

      await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

      const dialog = page.getByRole('dialog', { name: '公開カレンダー' });
      await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
        timeout: 10000,
      });

      // 選択状態のリング・日別パネルを含めて検査する
      await dialog
        .locator('td.fc-daygrid-day:not(.fc-day-other)')
        .first()
        .click();
      await expect(dialog.locator('td.fc-day-selected')).toHaveCount(1);

      await expectNoA11yViolations(
        page,
        `公開カレンダー（日付選択後） / ${theme}`,
      );
    });
  }
});
