/**
 * ログインページ E2Eテスト
 */

import { test, expect } from '@playwright/test';

import { TEST_USER } from '../helpers/testUser';

test.describe('ログインページ', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin');
  });

  test('フォームが正しく表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
    await expect(page.getByLabel('メールアドレス')).toBeVisible();
    await expect(page.getByLabel('パスワード')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
    await expect(page.getByRole('link', { name: '新規登録' })).toBeVisible();
  });

  test('正常なログインでホームにリダイレクトされる', async ({ page }) => {
    await page.getByLabel('メールアドレス').fill(TEST_USER.email);
    await page.getByLabel('パスワード').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'ログイン' }).click();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('メールアドレス未入力でバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByLabel('パスワード').fill('Password123');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(
      page.getByText('メールアドレスを入力してください'),
    ).toBeVisible();
  });

  test('パスワード未入力でバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByLabel('メールアドレス').fill('test@example.com');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(page.getByText('パスワードを入力してください')).toBeVisible();
  });

  test('メールアドレス形式不正でバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByLabel('メールアドレス').fill('invalid-email');
    await page.getByLabel('パスワード').fill('Password123');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(
      page.getByText('メールアドレスの形式が正しくありません'),
    ).toBeVisible();
  });

  test('不正な認証情報でエラーメッセージが表示される', async ({ page }) => {
    await page.getByLabel('メールアドレス').fill('wrong@example.com');
    await page.getByLabel('パスワード').fill('WrongPassword123');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(
      page.getByText('メールアドレスまたはパスワードが正しくありません。'),
    ).toBeVisible();
  });

  test('新規登録リンクでサインアップページに遷移する', async ({ page }) => {
    await page.getByRole('link', { name: '新規登録' }).click();

    await expect(page).toHaveURL('/auth/signup');
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
