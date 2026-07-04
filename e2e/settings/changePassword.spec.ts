/**
 * パスワード変更ページ E2Eテスト（認証済み・ページ通しジャーニー）
 *
 * change-password は OTP検証ベースの3ステップ:
 *   1. 「確認コードを送信」
 *   2. OTP検証（確認コード入力）
 *   3. 新パスワード入力 → 変更
 *
 * 実際にテストユーザーのパスワードを変更すると storageState 認証が壊れるため、
 * ネットワーク（OTP送信/検証/変更API）は page.route でモックし、ページの
 * ステップ遷移・バリデーション・成功/失敗トーストを決定論的に検証する。
 * ※ 実OTP-DB統合（action_type password_change）は #394 の担当。
 *
 * ユーザーストーリー網羅:
 * - 正常系: OTP送信 → 検証 → 新PW入力 → 成功トースト＋初期ステップに戻り成功メッセージ表示
 * - 入力バリデーション: 新PWと確認が不一致 → 「パスワードが一致しません」
 * - エラー応答: 変更APIが失敗 → エラートースト「パスワード変更エラー」
 */

import { test, expect } from '../fixtures/auth';

/** OTP送信・検証を成功でモックし、ステップ3（新パスワード入力）まで進める */
async function mockOtpSuccess(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/otp/send', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route('**/api/auth/otp/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

/** ステップ1→2→3 を進めて新パスワード入力フォームを表示させる */
async function advanceToNewPasswordStep(page: import('@playwright/test').Page) {
  await page.goto('/settings/change-password');

  // ステップ1: 説明文＋送信ボタン
  await expect(
    page.getByText(
      'パスワードを変更するには、メールアドレスに確認コードを送信します。',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: '確認コードを送信' }).click();

  // ステップ2: OTP検証
  await expect(
    page.getByRole('heading', { name: '確認コードを入力' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: '確認コード', exact: true })
    .fill('123456');
  await page.getByRole('button', { name: '確認コードを検証' }).click();

  // ステップ3: 新パスワード入力
  await expect(
    page.getByRole('button', { name: 'パスワードを変更' }),
  ).toBeVisible();
}

test.describe('パスワード変更ページ（認証済み）', () => {
  test('正常系: OTP送信→検証→新PW入力で成功トーストが表示される', async ({
    authenticatedPage: page,
  }) => {
    await mockOtpSuccess(page);
    await page.route('**/api/user/change-password', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'パスワードを変更しました',
        }),
      });
    });

    await advanceToNewPasswordStep(page);

    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPass123');
    await page.getByLabel('新しいパスワード（確認）').fill('NewPass123');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    // 成功トースト（本体とaria-liveで2要素のため first）
    await expect(page.getByText('パスワード変更完了').first()).toBeVisible();

    // 初期ステップに戻り、成功メッセージが表示される
    await expect(
      page.getByText(
        'パスワードを変更するには、メールアドレスに確認コードを送信します。',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('パスワードを変更しました').first(),
    ).toBeVisible();
  });

  test('入力バリデーション: 新PWと確認が不一致だとエラーが表示される', async ({
    authenticatedPage: page,
  }) => {
    await mockOtpSuccess(page);
    await advanceToNewPasswordStep(page);

    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPass123');
    await page.getByLabel('新しいパスワード（確認）').fill('Different123');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(page.getByText('パスワードが一致しません')).toBeVisible();
  });

  test('エラー応答: 変更APIが失敗するとエラートーストが表示される', async ({
    authenticatedPage: page,
  }) => {
    await mockOtpSuccess(page);
    await page.route('**/api/user/change-password', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'BAD_REQUEST', message: '変更に失敗しました' },
        }),
      });
    });

    await advanceToNewPasswordStep(page);

    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPass123');
    await page.getByLabel('新しいパスワード（確認）').fill('NewPass123');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(page.getByText('パスワード変更エラー').first()).toBeVisible();
  });
});
