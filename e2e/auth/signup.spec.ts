/**
 * 新規登録ページ E2Eテスト
 */

import { test, expect } from '@playwright/test';

test.describe('新規登録ページ', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signup');
  });

  test('フォームが正しく表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '新規登録' })).toBeVisible();
    await expect(page.getByLabel('メールアドレス')).toBeVisible();
    await expect(page.getByLabel('ユーザー名（任意）')).toBeVisible();
    await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
    await expect(page.getByLabel('パスワード（確認）')).toBeVisible();
    await expect(page.getByRole('button', { name: '新規登録' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ログイン' })).toBeVisible();
  });

  test('メールアドレス未入力でバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByLabel('パスワード', { exact: true }).fill('Password123');
    await page.getByLabel('パスワード（確認）').fill('Password123');
    await page.getByRole('button', { name: '新規登録' }).click();

    await expect(
      page.getByText('メールアドレスを入力してください'),
    ).toBeVisible();
  });

  test('パスワードが短すぎるとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByLabel('メールアドレス').fill('test@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('Pw1');
    await page.getByLabel('パスワード（確認）').fill('Pw1');
    await page.getByRole('button', { name: '新規登録' }).click();

    await expect(
      page.getByText('パスワードは8文字以上で入力してください'),
    ).toBeVisible();
  });

  test('パスワードに大文字がないとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByLabel('メールアドレス').fill('test@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('password123');
    await page.getByLabel('パスワード（確認）').fill('password123');
    await page.getByRole('button', { name: '新規登録' }).click();

    await expect(
      page.getByText('パスワードに大文字を含めてください'),
    ).toBeVisible();
  });

  test('パスワード確認が一致しないとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByLabel('メールアドレス').fill('test@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('Password123');
    await page.getByLabel('パスワード（確認）').fill('Different123');
    await page.getByRole('button', { name: '新規登録' }).click();

    await expect(page.getByText('パスワードが一致しません')).toBeVisible();
  });

  test('ログインリンクでログインページに遷移する', async ({ page }) => {
    await page.getByRole('link', { name: 'ログイン' }).click();

    await expect(page).toHaveURL('/auth/signin');
  });

  // DB汚染防止のため実際の登録テストはスキップ
  test.skip('正常な登録フロー', async ({ page }) => {
    await page.getByLabel('メールアドレス').fill('newuser@example.com');
    await page.getByLabel('ユーザー名（任意）').fill('テストユーザー');
    await page.getByLabel('パスワード', { exact: true }).fill('Password123');
    await page.getByLabel('パスワード（確認）').fill('Password123');
    await page.getByRole('button', { name: '新規登録' }).click();

    await expect(page).toHaveURL('/auth/signin');
  });
});
