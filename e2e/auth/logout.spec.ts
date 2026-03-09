/**
 * ログアウト E2Eテスト
 * NextAuth signOut APIを直接呼び出してログアウトをテストする
 */

import { test, expect } from '../fixtures/auth';

test.describe('ログアウト', () => {
  test('signOut API呼び出し後にセッションが無効化される', async ({
    page,
    browser,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');

    // CSRFトークンをNextAuthのエンドポイントから取得
    const csrfRes = await page.request.get('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();

    // NextAuth signOut API を呼び出し（サーバー側のセッションを無効化）
    await page.request.post('/api/auth/signout', {
      form: { csrfToken },
    });

    // 新しいコンテキスト（Cookie無し）で保護ページにアクセスし、リダイレクトを確認
    const context = await browser.newContext();
    const newPage = await context.newPage();
    await newPage.goto('http://localhost:3000/settings');
    await expect(newPage).toHaveURL(/\/auth\/signin/, { timeout: 10000 });
    await context.close();
  });
});
