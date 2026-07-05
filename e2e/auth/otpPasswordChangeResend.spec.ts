/**
 * OTP補完 E2Eテスト（#394）
 *
 * otpFlow.spec.ts（registration/login）でカバーしていない以下を補完:
 * 1. パスワード変更時のOTP（action_type password_change）を実フローで検証
 *    （送信→DB取得→検証→新パスワード入力ステップ到達）。
 *    ※ 実際に新パスワードは送信しない（storageState認証を壊さないため、OTP検証成立までを担保）
 * 2. OTP再送（resend）フロー。60秒カウントダウン後に「コードを再送信」が可能になる仕様のため、
 *    page.clock で時間を早送りして検証する。
 *
 * メール実送信には依存しない（OTP_EMAIL_TEST_BYPASS＋DBからコード取得）。
 */

import { test, expect } from '../fixtures/auth';
import { getLatestOtpCode, cleanupOtpCodes } from '../helpers/api';
import { TEST_USER } from '../helpers/testUser';

test.describe.configure({ mode: 'serial' });

test.describe('パスワード変更OTP（認証済み・action_type password_change）', () => {
  test.beforeEach(async () => {
    await cleanupOtpCodes(TEST_USER.email, 'password_change');
  });

  test.afterEach(async () => {
    await cleanupOtpCodes(TEST_USER.email, 'password_change');
  });

  test('確認コード送信→DB取得→検証で新パスワード入力ステップに到達する', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/settings/change-password');

    // ステップ1: OTP送信（実送信はbypass、コードはDBに保存される）
    await page.getByRole('button', { name: '確認コードを送信' }).click();

    // ステップ2: OTP検証画面
    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();

    // password_change のOTPコードをDBから取得
    const code = await getLatestOtpCode(TEST_USER.email, 'password_change');
    expect(code).toBeTruthy();

    await page
      .getByRole('textbox', { name: '確認コード', exact: true })
      .fill(code!);
    await page.getByRole('button', { name: '確認コードを検証' }).click();

    // ステップ3: 新パスワード入力へ到達（＝password_change OTPの検証成立）
    // ※ 実PW変更は行わない
    await expect(
      page.getByRole('button', { name: 'パスワードを変更' }),
    ).toBeVisible();
  });
});

test.describe('OTP再送（未認証・ログインOTP）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    await cleanupOtpCodes(TEST_USER.email, 'login');
  });

  test.afterEach(async () => {
    await cleanupOtpCodes(TEST_USER.email, 'login');
  });

  test('60秒経過後に「コードを再送信」でき、カウントダウンが再開する', async ({
    page,
  }) => {
    // カウントダウン（setInterval）を制御するため時計をモック
    await page.clock.install();

    await page.goto('/auth/signin');
    await page.getByRole('button', { name: 'メールでログイン' }).click();
    await page.getByLabel('メールアドレス').fill(TEST_USER.email);
    await page.getByRole('button', { name: 'ログインコードを送信' }).click();

    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();

    // 初期はカウントダウン中で再送ボタンは出ていない
    await expect(page.getByText('再送信まで')).toBeVisible();
    const resendButton = page.getByRole('button', {
      name: '確認コードを再送信',
    });
    await expect(resendButton).toBeHidden();

    // 60秒早送りすると再送ボタンが有効化される。
    // カウントダウンは毎秒 interval を張り直す実装のため、1秒ずつ進めて
    // React の再レンダリング（interval再生成）を挟む。
    for (let i = 0; i < 61; i++) {
      await page.clock.fastForward(1_000);
    }
    await expect(resendButton).toBeVisible();

    // 再送するとカウントダウンが再開（再送ボタンが再び消える）
    await resendButton.click();
    await expect(page.getByText('再送信まで')).toBeVisible();
    await expect(resendButton).toBeHidden();
  });
});
