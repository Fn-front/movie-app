/**
 * ログイン E2Eテスト
 * クリティカルユーザージャーニーのみ（バリデーション・UI表示は結合テストに移行済み）
 */

import { test, expect } from '@playwright/test';

import { TEST_USER } from '../helpers/testUser';

test.describe('ログイン認証フロー', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('正常なログインでホームにリダイレクトされる', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByLabel('メールアドレス').fill(TEST_USER.email);
    await page.getByLabel('パスワード').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'ログイン' }).click();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('不正な認証情報でエラーメッセージが表示される', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByLabel('メールアドレス').fill('wrong@example.com');
    await page.getByLabel('パスワード').fill('WrongPassword123');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(
      page.getByRole('alert').filter({
        hasText: 'メールアドレスまたはパスワードが正しくありません。',
      }),
    ).toBeVisible();
  });
});

test.describe('認証済みユーザーのリダイレクト', () => {
  test('認証済みユーザーがログインページにアクセスするとホームにリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/auth/signin');

    await expect(page).toHaveURL('/');
  });
});
