/**
 * 未認証アクセス保護 E2Eテスト
 */

import { test, expect } from '../fixtures/auth';

test.describe('未認証アクセス保護', () => {
  // storageStateを空にして未認証状態にする
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未認証で /settings にアクセスするとログインページへリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('未認証で /movies/upcoming にはアクセスできる', async ({ page }) => {
    await page.goto('/movies/upcoming');

    await expect(page).toHaveURL('/movies/upcoming');
  });

  test('未認証で /movies/now-showing にはアクセスできる', async ({ page }) => {
    await page.goto('/movies/now-showing');

    await expect(page).toHaveURL('/movies/now-showing');
  });

  test('未認証で / にはアクセスできる', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/');
  });
});

test.describe('認証済みアクセス', () => {
  test('認証済みで /auth/signin にアクセスするとホームへリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/auth/signin');

    await expect(page).toHaveURL('/');
  });

  test('認証済みで /auth/signup にアクセスするとホームへリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/auth/signup');

    await expect(page).toHaveURL('/');
  });
});
