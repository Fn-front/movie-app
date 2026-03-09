/**
 * ログアウト E2Eテスト
 * NextAuth signOut APIを直接呼び出してログアウトをテストする
 */

import { test, expect } from '../fixtures/auth';

test.describe('ログアウト', () => {
  test('signOut API呼び出し後にログインページへリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');

    // CSRFトークンをNextAuthのエンドポイントから取得
    const csrfRes = await page.request.get('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();

    // page.request はブラウザとCookieを共有し、Set-Cookie も正しく反映される
    await page.request.post('/api/auth/signout', {
      form: { csrfToken },
    });

    // セッションが破棄されたことを確認：保護ページへアクセスするとログインへリダイレクト
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10000 });
  });
});
