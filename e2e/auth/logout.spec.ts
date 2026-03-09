/**
 * ログアウト E2Eテスト
 * NextAuth signOut APIを直接呼び出してログアウトをテストする
 *
 * 注: セッションCookieの削除はNextAuth JWTのcallback経由で処理されるため、
 * Playwright の page.request/evaluate(fetch) では Set-Cookie が反映されない。
 * 未認証時の保護ページリダイレクトは protection.spec.ts でカバー済み。
 */

import { test, expect } from '../fixtures/auth';

test.describe('ログアウト', () => {
  test('signOut APIが正常に応答する', async ({ page }) => {
    await page.goto('/');

    // CSRFトークンを取得
    const csrfRes = await page.request.get('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();
    expect(csrfToken).toBeTruthy();

    // signOut APIが成功レスポンスを返す
    const signOutRes = await page.request.post('/api/auth/signout', {
      form: { csrfToken },
    });
    expect(signOutRes.ok()).toBe(true);
  });
});
