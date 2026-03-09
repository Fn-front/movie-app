/**
 * ログアウト E2Eテスト
 * NextAuth signOut APIを直接呼び出してログアウトをテストする
 */

import { test, expect } from '../fixtures/auth';

test.describe('ログアウト', () => {
  test('signOut API呼び出しが成功しセッションが無効化される', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');

    // 認証済みであることを確認（セッションAPIが有効なユーザー情報を返す）
    const sessionBefore = await page.request.get('/api/auth/session');
    const sessionData = await sessionBefore.json();
    expect(sessionData.user).toBeTruthy();

    // CSRFトークンをNextAuthのエンドポイントから取得
    const csrfRes = await page.request.get('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();

    // NextAuth signOut API を呼び出し
    const signOutRes = await page.request.post('/api/auth/signout', {
      form: { csrfToken },
    });
    expect(signOutRes.ok()).toBe(true);

    // signOut後にセッションが無効化されていることを確認
    const sessionAfter = await page.request.get('/api/auth/session');
    const sessionAfterData = await sessionAfter.json();
    expect(sessionAfterData.user).toBeFalsy();
  });
});
