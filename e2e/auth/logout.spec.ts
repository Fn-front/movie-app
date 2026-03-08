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

    // NextAuth signOut をクライアント側で実行
    await page.evaluate(async () => {
      const res = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          csrfToken:
            document.cookie
              .split('; ')
              .find((c) => c.startsWith('next-auth.csrf-token'))
              ?.split('=')[1]
              ?.split('%')[0] ?? '',
          callbackUrl: '/auth/signin',
        }),
      });
      // signOut APIのレスポンスに従いリダイレクト
      if (res.redirected) {
        window.location.href = res.url;
      }
    });

    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10000 });
  });
});
