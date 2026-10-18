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
