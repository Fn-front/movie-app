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

/**
 * OTP送信・検証を成功でモックし、ステップ3（新パスワード入力）まで進める
 *
 * 検証APIは `data.verificationToken` を返す必要がある。パスワード変更の本人確認は
 * このワンタイムトークンで行われ、無い場合はフォームが送信前に弾くため
 * （src/features/settings/changePasswordForm/changePasswordForm.tsx）。
 */
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
      body: JSON.stringify({
        success: true,
        data: { verificationToken: 'e2e-verification-token' },
      }),
    });
  });
}

/**
 * 「現在のパスワード」を入力する
 *
 * パスワード設定済みユーザーには必須（#643）。未入力だとクライアント側の
 * バリデーションで止まり、変更APIが呼ばれない。
 * APIはモックしているため値の正しさは問われない。
 */
async function fillCurrentPassword(page: import('@playwright/test').Page) {
  await page.getByLabel('現在のパスワード').fill('CurrentPass123');
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
  await expect(page.getByRole('button', { name: '変更する' })).toBeVisible();
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

    await fillCurrentPassword(page);
    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPassword123');
    await page.getByLabel('新しいパスワード（確認）').fill('NewPassword123');
    await page.getByRole('button', { name: '変更する' }).click();

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
      .fill('NewPassword123');
    await page
      .getByLabel('新しいパスワード（確認）')
      .fill('DifferentPassword123');
    await page.getByRole('button', { name: '変更する' }).click();

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

    await fillCurrentPassword(page);
    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPassword123');
    await page.getByLabel('新しいパスワード（確認）').fill('NewPassword123');
    await page.getByRole('button', { name: '変更する' }).click();

    await expect(page.getByText('パスワード変更エラー').first()).toBeVisible();
  });
});

test.describe('パスワード変更ページ — バリデーション/送信失敗（認証済み・#400）', () => {
  // 新パスワードのバリデーション分岐（複雑性/長さ/バイト数/必須）。
  // zod の検証順（min → バイト数 → 大文字 → 小文字 → 数字）に沿い、直前チェックは
  // 通過して対象チェックだけを失敗させる入力を用意する。
  const complexityCases = [
    {
      title: '12文字未満',
      password: 'Pass1',
      message: 'パスワードは12文字以上で入力してください',
    },
    {
      // bcrypt が72バイトで黙って切り詰めるため上限を設けている（#652）
      title: '72バイト超',
      password: `Aa1${'x'.repeat(70)}`,
      message:
        'パスワードは72バイト以内で入力してください（日本語は1文字3バイト）',
    },
    {
      // 26文字しかないが75バイト。文字数で判定していたら通ってしまう
      title: '日本語を含み72バイト超',
      password: `Aa1${'あ'.repeat(24)}`,
      message:
        'パスワードは72バイト以内で入力してください（日本語は1文字3バイト）',
    },
    {
      title: '大文字欠落',
      password: 'password1234',
      message: 'パスワードに大文字を含めてください',
    },
    {
      title: '小文字欠落',
      password: 'PASSWORD1234',
      message: 'パスワードに小文字を含めてください',
    },
    {
      title: '数字欠落',
      password: 'PasswordAbcd',
      message: 'パスワードに数字を含めてください',
    },
  ];

  for (const { title, password, message } of complexityCases) {
    test(`入力バリデーション: 新PWが${title}だと「${message}」が表示される`, async ({
      authenticatedPage: page,
    }) => {
      await mockOtpSuccess(page);
      await advanceToNewPasswordStep(page);

      await page.getByLabel('新しいパスワード', { exact: true }).fill(password);
      await page.getByLabel('新しいパスワード（確認）').fill(password);
      await page.getByRole('button', { name: '変更する' }).click();

      await expect(page.getByText(message)).toBeVisible();
    });
  }

  test('入力バリデーション: 確認用パスワードが未入力だとエラーが表示される', async ({
    authenticatedPage: page,
  }) => {
    await mockOtpSuccess(page);
    await advanceToNewPasswordStep(page);

    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPassword123');
    // 確認は未入力のまま送信
    await page.getByRole('button', { name: '変更する' }).click();

    await expect(
      page.getByText('パスワード（確認）を入力してください'),
    ).toBeVisible();
  });

  test('エラー応答: ステップ1でOTP送信が失敗するとエラーが表示される', async ({
    authenticatedPage: page,
  }) => {
    // OTP送信APIを失敗でモック
    await page.route('**/api/auth/otp/send', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'コードの送信に失敗しました',
          },
        }),
      });
    });

    await page.goto('/settings/change-password');
    await page.getByRole('button', { name: '確認コードを送信' }).click();

    // ステップ1に留まり、エラー（role=alert）が表示される
    // ※ Next.js のルートアナウンサー（空のrole=alert）と区別するため中身のあるものに絞る
    await expect(
      page.getByRole('alert').filter({ hasText: /\S/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '確認コードを送信' }),
    ).toBeVisible();
  });
});
