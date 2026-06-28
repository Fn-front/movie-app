/**
 * 確認コード(OTP)フロー E2Eテスト（未認証）
 *
 * メール実送信に依存せず検証する:
 * - サーバーは OTP_EMAIL_TEST_BYPASS=true で起動し、メール送信をスキップ（成功扱い）
 * - OTPコードは otp_codes テーブルから service role で取得して入力する
 *
 * カバーするストーリー:
 * 1. 新規登録 → 確認コード入力 → 認証完了 → サインイン
 * 2. メールOTPログイン → 確認コード入力 → ログイン成功
 */

import { test, expect } from '@playwright/test';

import {
  getLatestOtpCode,
  cleanupAuthUser,
  expireOtpCode,
  maxOutOtpAttempts,
} from '../helpers/api';
import { TEST_USER } from '../helpers/testUser';

// 同一メールのOTPを直列で扱うためシリアル実行
test.describe.configure({ mode: 'serial' });

test.describe('確認コード(OTP)フロー（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const signupEmail = 'signup-otp-e2e@example.com';
  const errEmail = 'signup-otp-err-e2e@example.com';
  const expiredEmail = 'signup-otp-expired-e2e@example.com';
  const maxAttemptsEmail = 'signup-otp-maxatt-e2e@example.com';

  test.afterAll(async () => {
    await cleanupAuthUser(signupEmail);
    await cleanupAuthUser(errEmail);
    await cleanupAuthUser(expiredEmail);
    await cleanupAuthUser(maxAttemptsEmail);
  });

  /** 新規登録して確認コード入力画面まで進める（異常系の共通前処理） */
  async function gotoOtpScreenViaSignup(
    page: import('@playwright/test').Page,
    email: string,
  ): Promise<void> {
    await cleanupAuthUser(email);
    await page.goto('/auth/signup');
    await page.getByLabel('メールアドレス').fill(email);
    await page.getByLabel('パスワード', { exact: true }).fill('Password123');
    await page.getByLabel('パスワード（確認）').fill('Password123');
    await page.getByRole('button', { name: '新規登録' }).click();
    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();
  }

  test('新規登録 → 確認コード入力 → 認証完了 → サインイン', async ({
    page,
  }) => {
    await cleanupAuthUser(signupEmail);

    await page.goto('/auth/signup');
    await page.getByLabel('メールアドレス').fill(signupEmail);
    await page.getByLabel('パスワード', { exact: true }).fill('Password123');
    await page.getByLabel('パスワード（確認）').fill('Password123');
    await page.getByRole('button', { name: '新規登録' }).click();

    // 確認コード入力画面に遷移
    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();

    // DBから登録用OTPコードを取得して入力
    const code = await getLatestOtpCode(signupEmail, 'registration');
    expect(code).toBeTruthy();
    await page.getByLabel('確認コード', { exact: true }).fill(code!);
    await page.getByRole('button', { name: '確認コードを検証' }).click();

    // 検証成功でサインインページへ
    await page.waitForURL(/\/auth\/signin/);
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('誤った確認コードだとエラーが表示され遷移しない', async ({ page }) => {
    await cleanupAuthUser(errEmail);

    await page.goto('/auth/signup');
    await page.getByLabel('メールアドレス').fill(errEmail);
    await page.getByLabel('パスワード', { exact: true }).fill('Password123');
    await page.getByLabel('パスワード（確認）').fill('Password123');
    await page.getByRole('button', { name: '新規登録' }).click();

    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();

    // 実コードと異なる値を入力（実コードが偶然一致しないことを確認）
    const realCode = await getLatestOtpCode(errEmail, 'registration');
    const wrongCode = realCode === '000000' ? '111111' : '000000';
    await page.getByLabel('確認コード', { exact: true }).fill(wrongCode);
    await page.getByRole('button', { name: '確認コードを検証' }).click();

    // エラーが表示され、確認コード画面に留まる
    await expect(page.getByText('確認コードが間違っています。')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();
  });

  test('有効期限切れの確認コードだとエラーが表示される', async ({ page }) => {
    await gotoOtpScreenViaSignup(page, expiredEmail);

    // DBで期限を過去に書き換えてから、正しいコードを入力
    const code = await getLatestOtpCode(expiredEmail, 'registration');
    expect(code).toBeTruthy();
    await expireOtpCode(expiredEmail, 'registration');

    await page.getByLabel('確認コード', { exact: true }).fill(code!);
    await page.getByRole('button', { name: '確認コードを検証' }).click();

    await expect(
      page.getByText('確認コードの有効期限が切れました。再送信してください。'),
    ).toBeVisible();
  });

  test('試行回数の上限超過でエラーが表示される', async ({ page }) => {
    await gotoOtpScreenViaSignup(page, maxAttemptsEmail);

    // DBで試行回数を上限まで引き上げてから検証
    await maxOutOtpAttempts(maxAttemptsEmail, 'registration');

    await page.getByLabel('確認コード', { exact: true }).fill('000000');
    await page.getByRole('button', { name: '確認コードを検証' }).click();

    await expect(
      page.getByText(
        '試行回数の上限に達しました。新しいコードを再送信してください。',
      ),
    ).toBeVisible();
  });

  test('メールOTPログイン → 確認コード入力 → ログイン成功', async ({
    page,
  }) => {
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: 'メールでログイン' }).click();

    // メール入力 → ログインコード送信
    await page.getByLabel('メールアドレス').fill(TEST_USER.email);
    await page.getByRole('button', { name: 'ログインコードを送信' }).click();

    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();

    // DBからログイン用OTPコードを取得して入力
    const code = await getLatestOtpCode(TEST_USER.email, 'login');
    expect(code).toBeTruthy();
    await page.getByLabel('確認コード', { exact: true }).fill(code!);
    await page.getByRole('button', { name: '確認コードを検証' }).click();

    // ログイン成功でホームへ
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });
});
