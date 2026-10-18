/**
 * E2E認証fixture
 * storageStateを使い認証済みセッションを保存・再利用する
 */

import { test as base, type Page } from '@playwright/test';

import { STORAGE_STATE } from '../../playwright.config';
import { cleanupAllRateLimits } from '../helpers/api';
import { getCurrentTotpCode } from '../helpers/totp';
import { TEST_USER } from '../helpers/testUser';

/** ログインに使う資格情報 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * ログイン共通関数
 *
 * 二段階認証が有効なユーザーでも通せるようにしている。有効な場合は
 * ホームへ遷移せず、同じ画面に「認証コード」の入力欄が出るため、
 * 認証アプリの代わりに DB の共有鍵からコードを計算して入力する
 * （`helpers/totp.ts`。製品コード側にテスト用の抜け道は作らない）。
 *
 * @param page - Playwright のページ
 * @param credentials - 資格情報。既定は共有のテストユーザー
 */
export async function performLogin(
  page: Page,
  credentials: LoginCredentials = TEST_USER,
): Promise<void> {
  await page.goto('/auth/signin');
  await page.getByLabel('メールアドレス').fill(credentials.email);
  await page.getByLabel('パスワード').fill(credentials.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();

  const totpField = page.getByLabel('認証コード');

  // ホームへ遷移するか、認証コード欄が出るかのどちらかを待つ。
  // 片方が先に決まれば十分なので、負けた方のタイムアウトは握りつぶす。
  await Promise.race([
    page.waitForURL('/').catch(() => undefined),
    totpField.waitFor({ state: 'visible' }).catch(() => undefined),
  ]);

  if (await totpField.isVisible()) {
    const code = await getCurrentTotpCode(credentials.email);

    if (!code) {
      throw new Error(
        `${credentials.email} は二段階認証が有効ですが、共有鍵を取得できませんでした。` +
          'TOTP_ENCRYPTION_KEY と SUPABASE_SERVICE_ROLE_KEY の設定を確認してください。',
      );
    }

    await totpField.fill(code);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  }

  await page.waitForURL('/');
}

/**
 * グローバル認証セットアップ
 * setupプロジェクトからstorageStateを生成する。
 *
 * ここで rate_limits テーブルを全消しし、公開API (AWARDS_FETCH 等 IPベース)
 * とユーザー系 (WRITE_FAVORITES 等 user_idベース) の両方を確定的な初期状態にする。
 */
export async function globalAuthSetup(page: Page): Promise<void> {
  await cleanupAllRateLimits();
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
