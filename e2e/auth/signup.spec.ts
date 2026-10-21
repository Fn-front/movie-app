/**
 * 新規登録 E2Eテスト
 * クリティカルユーザージャーニーのみ（バリデーション・UI表示は結合テストに移行済み）
 */

import { test, expect } from '@playwright/test';

import { runScopedEmail } from '../helpers/runScope';

/**
 * 登録に使うパスワード
 *
 * 登録APIは HIBP の漏洩リストと照合するため（#652）、漏洩上位の文字列は
 * 拒否される。ポリシー（12文字以上・大小文字・数字）も満たすこと。
 */
const SIGNUP_PASSWORD = 'E2eSignupKx7Qm2';

/**
 * 登録に使うメールアドレス
 *
 * 現状このテストはスキップされているが、有効化したときに他の run と
 * 衝突しないよう run 単位にしておく（理由は runScope.ts を参照／#793）。
 */
const SIGNUP_EMAIL = runScopedEmail('newuser');

test.describe('新規登録フロー', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // DB汚染防止のため実際の登録テストはスキップ
  test.skip('正常な登録フロー', async ({ page }) => {
    await page.goto('/auth/signup');

    await page.getByLabel('メールアドレス').fill(SIGNUP_EMAIL);
    await page.getByLabel('ユーザー名（任意）').fill('テストユーザー');
    await page.getByLabel('パスワード', { exact: true }).fill(SIGNUP_PASSWORD);
    await page.getByLabel('パスワード（確認）').fill(SIGNUP_PASSWORD);
    await page.getByRole('button', { name: '登録する' }).click();

    await expect(page).toHaveURL('/auth/signin');
  });
});
