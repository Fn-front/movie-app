/**
 * 新規登録 E2Eテスト
 * クリティカルユーザージャーニーのみ（バリデーション・UI表示は結合テストに移行済み）
 */

import { test, expect } from '@playwright/test';

test.describe('新規登録フロー', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // DB汚染防止のため実際の登録テストはスキップ
  test.skip('正常な登録フロー', async ({ page }) => {
    await page.goto('/auth/signup');

    await page.getByLabel('メールアドレス').fill('newuser@example.com');
    await page.getByLabel('ユーザー名（任意）').fill('テストユーザー');
    await page.getByLabel('パスワード', { exact: true }).fill('Password123');
    await page.getByLabel('パスワード（確認）').fill('Password123');
    await page.getByRole('button', { name: '新規登録' }).click();

    await expect(page).toHaveURL('/auth/signin');
  });
});
