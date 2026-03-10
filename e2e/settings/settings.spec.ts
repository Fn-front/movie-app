/**
 * 設定ページ E2Eテスト（認証済み）
 */

import { test, expect } from '@playwright/test';

test.describe('設定ページ（認証済み）', () => {
  test('設定画面のセクションが表示される', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'プロフィール' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '通知' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '外観' })).toBeVisible();
  });

  test('パスワード変更フォームが表示される', async ({ page }) => {
    await page.goto('/settings/change-password');
    await expect(
      page.getByRole('heading', { name: 'パスワード変更' }),
    ).toBeVisible();
    await expect(page.getByLabel('現在のパスワード')).toBeVisible();
    await expect(
      page.getByLabel('新しいパスワード', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('新しいパスワード（確認）')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'パスワードを変更' }),
    ).toBeVisible();
  });

  test('現在のパスワード未入力でバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/settings/change-password');
    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPass123');
    await page.getByLabel('新しいパスワード（確認）').fill('NewPass123');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(page.getByText('パスワードを入力してください')).toBeVisible();
  });

  test('新しいパスワードが短すぎるとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/settings/change-password');
    await page.getByLabel('現在のパスワード').fill('Current123');
    await page.getByLabel('新しいパスワード', { exact: true }).fill('Pw1');
    await page.getByLabel('新しいパスワード（確認）').fill('Pw1');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(
      page.getByText('パスワードは8文字以上で入力してください'),
    ).toBeVisible();
  });

  test('新しいパスワード確認が一致しないとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/settings/change-password');
    await page.getByLabel('現在のパスワード').fill('Current123');
    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPassword123');
    await page.getByLabel('新しいパスワード（確認）').fill('Different123');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(page.getByText('パスワードが一致しません')).toBeVisible();
  });
});

test.describe('設定ページ操作', () => {
  test('表示名フォームが表示される', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByLabel('表示名')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '表示名を更新' }),
    ).toBeVisible();
  });

  test('表示名が空のままだとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.getByLabel('表示名').clear();
    await page.getByRole('button', { name: '表示名を更新' }).click();

    await expect(page.getByText(/表示名/)).toBeVisible();
  });

  test('通知設定のチェックボックスが表示される', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page.getByRole('checkbox', { name: '公開日リマインダーを受け取る' }),
    ).toBeVisible();
  });

  test('テーマ選択が表示される', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page.getByText('テーマを選択', { exact: false }),
    ).toBeVisible();
  });

  test('パスワード変更ページに遷移できる', async ({ page }) => {
    await page.goto('/settings/change-password');
    await expect(
      page.getByRole('heading', { name: 'パスワード変更' }),
    ).toBeVisible();
  });
});

test.describe('設定ページ（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未認証アクセスでログインページにリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
