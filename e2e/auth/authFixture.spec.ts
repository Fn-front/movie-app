/**
 * 認証fixture（performLogin）のE2Eテスト（#733）
 *
 * `performLogin` は `global.setup.ts` から呼ばれ、認証必須のE2Eが使う
 * storageState を作る。ここが通らないと認証系テストが一斉に落ちるため、
 * 二段階認証の有無どちらでも通ることを確認する。
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#750）。二段階認証の有効化は
 * ユーザーの状態を書き換えるため、専用ユーザーを作って完結させる。
 */

import { test, expect, type Page } from '@playwright/test';

import { performLogin } from '../fixtures/auth';
import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForEmail,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';
import {
  cleanupTotp,
  getTotpSecret,
  totpCodeFromSecret,
} from '../helpers/totp';

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-auth-fixture'),
  password: 'AuthFixtureE2e1',
} as const;

/** 作成したユーザーのID（totp_verify のレート制限は user_id で数える） */
let userId = '';

/** 設定画面から二段階認証を有効化する */
async function enableTwoFactor(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByRole('button', { name: '二段階認証を設定する' }).click();

  // QRが出た時点で共有鍵がDBに入る。認証アプリで読み取る操作の代わり
  await expect(
    page.getByRole('img', { name: '二段階認証のQRコード' }),
  ).toBeVisible();

  const secret = await getTotpSecret(USER.email);
  expect(secret).not.toBeNull();

  await page.getByLabel('認証コード').fill(totpCodeFromSecret(secret!));
  await page.getByRole('button', { name: '二段階認証を有効にする' }).click();

  await expect(
    page.getByRole('list', { name: 'リカバリーコード' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'リカバリーコードを控えた' }).click();
  await expect(page.getByText('二段階認証は')).toBeVisible();
}

/**
 * 1テストあたりログインを2回行う（有効化のため1回 → 二段階認証付きで1回）ものがあり、
 * bcrypt とDB往復で既定の30秒では足りない。
 */
test.describe.configure({ mode: 'serial', timeout: 90000 });

test.describe('認証fixture（performLogin）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    userId = await createVerifiedUser(USER);
  });

  test.afterAll(async () => {
    // 関連レコード（user_totp / totp_recovery_codes）は ON DELETE CASCADE で消える
    await deleteUserByEmail(USER.email);
  });

  const resetUserState = async (): Promise<void> => {
    await cleanupRateLimitsForEmail(USER.email);
    await cleanupRateLimitsForUser(userId);
    await cleanupLoginIpRateLimits();
    await cleanupTotp(USER.email);
  };

  test.beforeEach(resetUserState);
  test.afterEach(resetUserState);

  test('二段階認証が無効なユーザーでログインできる', async ({ page }) => {
    await performLogin(page, USER);

    await expect(page).toHaveURL('/');
  });

  test('二段階認証が有効なユーザーでもログインできる', async ({ page }) => {
    // 事前にログインして有効化する
    await performLogin(page, USER);
    await enableTwoFactor(page);
    await page.context().clearCookies();

    // 認証コードの入力まで performLogin が面倒を見る
    await performLogin(page, USER);

    await expect(page).toHaveURL('/');
  });

  test('二段階認証が有効なユーザーのstorageStateで保護ページを開ける', async ({
    page,
  }) => {
    await performLogin(page, USER);
    await enableTwoFactor(page);
    await page.context().clearCookies();

    await performLogin(page, USER);

    // storageState の実態はログイン後のCookie。保護ページが開けることを確認する
    await page.goto('/watchlist');

    await expect(page).toHaveURL('/watchlist');
    await expect(
      page.getByRole('heading', { name: 'ウォッチリスト', level: 1 }),
    ).toBeVisible();
  });
});
