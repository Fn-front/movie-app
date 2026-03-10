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

  test('Escapeキーでメニューが閉じる', async ({ page }) => {
    await page.getByRole('button', { name: 'ユーザーメニューを開く' }).click();

    await expect(page.getByRole('menu')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('menu')).not.toBeVisible();
  });
});
