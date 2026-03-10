/**
 * ユーザーメニュー E2Eテスト（認証済み）
 */

import { test, expect } from '@playwright/test';

test.describe('ユーザーメニュー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ユーザーメニューのトリガーボタンが表示される', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'ユーザーメニューを開く' }),
    ).toBeVisible();
  });

  test('ユーザー名が表示される', async ({ page }) => {
    const trigger = page.getByRole('button', {
      name: 'ユーザーメニューを開く',
    });
    await expect(trigger).toBeVisible();
    // トリガーボタン内にテキストが存在する
    await expect(trigger).not.toHaveText('');
  });

  test('クリックでドロップダウンメニューが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ユーザーメニューを開く' }).click();

    // メニュー内にメールアドレスが表示される
    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('メニュー内に設定リンクが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ユーザーメニューを開く' }).click();

    await expect(page.getByRole('menuitem', { name: /設定/ })).toBeVisible();
  });

  test('メニュー内にログアウトボタンが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ユーザーメニューを開く' }).click();

    await expect(
      page.getByRole('menuitem', { name: /ログアウト/ }),
    ).toBeVisible();
  });

  test('「設定」クリックで設定ページに遷移する', async ({ page }) => {
    await page.getByRole('button', { name: 'ユーザーメニューを開く' }).click();

    await page.getByRole('menuitem', { name: /設定/ }).click();

    await expect(page).toHaveURL('/settings');
  });

  test('メニュー内にメールアドレスが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ユーザーメニューを開く' }).click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    // DropdownMenu.Labelとして表示されるメールアドレス（@を含むテキスト）
    await expect(menu.locator('text=@')).toBeVisible();
  });

  test('Escapeキーでメニューが閉じる', async ({ page }) => {
    await page.getByRole('button', { name: 'ユーザーメニューを開く' }).click();

    await expect(page.getByRole('menu')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('menu')).not.toBeVisible();
  });
});

test.describe('ユーザーメニュー（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未認証時はユーザーメニューが表示されない', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(
      page.getByRole('button', { name: 'ユーザーメニューを開く' }),
    ).not.toBeVisible();
  });
});
