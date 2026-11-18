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
 * - エラー応答: 失敗して `?error=` で戻されたとき、理由が画面に出る（#1242）
 * - 状態保持: 表示後に `?error=` が URL から落ち、リロードで蘇らない
 * - セキュリティ: 知らないコードでも落とさず既定の文言に倒す
 */

import { test, expect } from '@playwright/test';

import { SIGN_IN_PAGE_ERROR_MESSAGES } from '../../src/constants/auth';

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

  /**
   * 失敗して戻されたときに理由が出る（#1242）
   *
   * Auth.js は `kind = 'signIn'` の失敗を `/auth/signin?error=` へ戻す。
   * 読んでいなかったため「押したのに何も起きずログイン画面に戻された」
   * ように見えていた。
   *
   * 実プロバイダの往復は要らない。`?error=` を直接開けば同じ状態になる
   */
  test.describe('失敗して戻されたとき', () => {
    test('理由が画面に表示される', async ({ page }) => {
      await page.goto('/auth/signin?error=OAuthCallbackError');

      await expect(page.getByRole('alert')).toHaveText(
        SIGN_IN_PAGE_ERROR_MESSAGES.OAuthCallbackError,
      );
    });

    test('知らないコードでも落ちず、既定の文言になる', async ({ page }) => {
      // `?error=` は URL に書くだけで誰でも踏める。`__proto__` は
      // 素の添字参照だとオブジェクトが返り、描画ごと落ちる（#1240）
      await page.goto('/auth/signin?error=__proto__');

      await expect(page.getByRole('alert')).toHaveText(
        SIGN_IN_PAGE_ERROR_MESSAGES.DEFAULT,
      );
      // 落ちていれば見出しごと消える
      await expect(
        page.getByRole('heading', { name: 'ログイン' }),
      ).toBeVisible();
    });

    test('表示後に ?error= が URL から落ち、リロードで蘇らない', async ({
      page,
    }) => {
      // MissingCSRF の文言は「再読み込みしてください」。クエリが残っていると
      // 言われたとおりにしても同じ画面に戻り続ける
      await page.goto(
        '/auth/signin?error=MissingCSRF&callbackUrl=%2Fwatchlist',
      );

      await expect(page.getByRole('alert')).toHaveText(
        SIGN_IN_PAGE_ERROR_MESSAGES.MissingCSRF,
      );

      // URL からは消えるが、表示中の文言はそのまま残す
      await expect(page).toHaveURL(/\?callbackUrl=%2Fwatchlist$/);
      await expect(page.getByRole('alert')).toBeVisible();

      await page.reload();

      await expect(
        page.getByRole('heading', { name: 'ログイン' }),
      ).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  });
});
