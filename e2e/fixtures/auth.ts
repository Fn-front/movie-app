/**
 * E2E認証fixture
 * storageStateを使い認証済みセッションを保存・再利用する
 */

import { test as base, type Page } from '@playwright/test';

import { STORAGE_STATE } from '../../playwright.config';
import { TEST_USER } from '../helpers/testUser';

/**
 * ログイン共通関数
 * /auth/signinページでメール・パスワードを入力しログインする
 */
export async function performLogin(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await page.getByLabel('メールアドレス').fill(TEST_USER.email);
  await page.getByLabel('パスワード').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/');
}

/**
 * グローバル認証セットアップ
 * setupプロジェクトからstorageStateを生成する
 */
export async function globalAuthSetup(page: Page): Promise<void> {
  await performLogin(page);
  await page.context().storageState({ path: STORAGE_STATE });
}

/**
 * 認証済みページfixture
 * authenticatedPageを使うとstorageState適用済みページが提供される
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await use(page);
  },
});

export { expect } from '@playwright/test';
