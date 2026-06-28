/**
 * モバイル ログイン導線 E2Eテスト（未認証）
 * SP表示幅で、ログアウト状態でもサイドメニューからログインできることを確認する
 */

import { test, expect } from '../fixtures/auth';

test.describe('モバイル ログイン導線（未認証）', () => {
  // storageStateを空にして未認証状態にする
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });

  test('未認証時、サイドメニューにログインボタンが表示される', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(page.getByText('メニュー')).toBeVisible();

    // 未認証時はログインボタンが表示され、設定/ログアウトは表示されない
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
    await expect(page.getByRole('button', { name: '設定' })).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ログアウト' }),
    ).not.toBeVisible();
  });

  test('ログインボタンクリックでサインインページへ遷移する', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
