/**
 * ソーシャルログイン（Google/GitHub） 表示確認 E2Eテスト（未認証）
 *
 * SSO の往復（実プロバイダでの認可・コールバック）は外部依存のため E2E では検証しない。
 * E2E は「入口」＝ signin/signup 両ページにソーシャルログインボタンが表示・操作可能で
 * あることまでを担保する。認可フローの往復ロジック（NextAuth の signIn/jwt/session
 * callback、新規/既存ユーザー紐付け）は結合/単体テストで検証する（別Issueで管理）。
 *
 * ユーザーストーリー網羅:
 * - 正常系（表示）: signin にGoogle/GitHubログインボタンが表示され、操作可能
 * - 正常系（表示）: signup にGoogle/GitHubログインボタンが表示され、操作可能
 */

import { test, expect } from '@playwright/test';

test.describe('ソーシャルログイン 表示確認（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('ログインページにGoogle/GitHubログインボタンが表示される', async ({
    page,
  }) => {
    await page.goto('/auth/signin');

    const google = page.getByRole('button', { name: 'Googleでログイン' });
    const github = page.getByRole('button', { name: 'GitHubでログイン' });

    await expect(google).toBeVisible();
    await expect(google).toBeEnabled();
    await expect(github).toBeVisible();
    await expect(github).toBeEnabled();
  });

  test('新規登録ページにGoogle/GitHubログインボタンが表示される', async ({
    page,
  }) => {
    await page.goto('/auth/signup');

    const google = page.getByRole('button', { name: 'Googleでログイン' });
    const github = page.getByRole('button', { name: 'GitHubでログイン' });

    await expect(google).toBeVisible();
    await expect(google).toBeEnabled();
    await expect(github).toBeVisible();
    await expect(github).toBeEnabled();
  });
});
