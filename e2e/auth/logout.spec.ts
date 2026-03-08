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
    const csrfToken = await page.evaluate(async () => {
      const res = await fetch('/api/auth/csrf');
      const data = await res.json();
      return data.csrfToken as string;
    });

    // NextAuth signOut をクライアント側で実行
    await page.evaluate(
      async ({ token }) => {
        const res = await fetch('/api/auth/signout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            csrfToken: token,
            callbackUrl: '/auth/signin',
          }),
          redirect: 'follow',
        });
        // レスポンスURLにリダイレクト
        if (res.url) {
          window.location.href = res.url;
        }
      },
      { token: csrfToken },
    );

    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10000 });
  });
});
