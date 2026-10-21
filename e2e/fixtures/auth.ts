/**
 * E2E認証fixture
 * storageStateを使い認証済みセッションを保存・再利用する
 */

import { test as base, type Page } from '@playwright/test';

import { STORAGE_STATE } from '../../playwright.config';
import { cleanupRunRateLimits } from '../helpers/api';
import { createVerifiedUser } from '../helpers/dedicatedUser';
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
 * 共有テストユーザーはここで作る。以前は環境変数で指定したDB上の固定ユーザーを
 * 使い回していたが、共有DBに複数のCI runが同時に流れると互いのデータを
 * 消し合うため、run ごとに作り直す（#793。削除は global.teardown.ts）。
 *
 * rate_limits も、この run の識別子（送信元IP・run固有メール）に限って
 * リセットし、確定的な初期状態から始める。
 */
export async function globalAuthSetup(page: Page): Promise<void> {
  await cleanupRunRateLimits();
  await createVerifiedUser(TEST_USER);
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
