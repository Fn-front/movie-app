/**
 * 二段階認証 E2Eテスト（#642）
 *
 * 設定画面での有効化から、二段階認証付きログイン、リカバリーコードでのログイン、
 * 無効化までを通しで確認する。
 *
 * 認証アプリの代わりは `e2e/helpers/totp.ts` が担う。製品コード側に
 * テスト用の抜け道は作らず、DBの暗号文をアプリと同じ手順で復号して
 * コードを計算する（OTPコードの総当たりと同じ考え方）。
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#750）。本 spec は二段階認証を有効化・
 * 無効化してユーザーの状態を書き換えるため、同じユーザーを使う
 * `otpFlow.spec.ts` などを並列実行時に壊す。`describe.configure({ mode: 'serial' })`
 * はファイル内の直列化しかせず、ファイル間の並列は防げない。
 * 専用ユーザーを作って完結させ、後片付けもそのユーザーに限定する。
 *
 * ユーザーストーリー網羅:
 * - 正常系: 有効化 → ログアウト → パスワード＋認証コードでログイン
 * - 復旧: リカバリーコードでログインできる
 * - 認証・認可: 認証コード無しではログインできない / 誤ったコードを拒否
 * - 重複・競合: 同じコードの使い回しを拒否
 * - 設定変更の保護: 所持の証明なしでは無効化できない
 * - 最も弱い経路: 二段階認証が有効ならメールOTP単独ログインを使えない
 */

import { test, expect, type Page } from '@playwright/test';

import { getLatestOtpCode } from '../helpers/api';
import {
  cleanupLoginIpRateLimits,
  cleanupOtpCodesForEmail,
  cleanupRateLimitsForEmail,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';
import {
  cleanupTotp,
  getCurrentTotpCode,
  getTotpSecret,
  isRecoveryCodeStored,
  totpCodeFromSecret,
} from '../helpers/totp';

/**
 * 本 spec 専用のユーザー。
 *
 * 他の spec と識別子が衝突しないよう用途が分かる名前にしたうえで、
 * run 単位の接尾辞を付ける（#793）。固定のままだと、共有DBに複数の
 * CI run が同時に流れたとき互いのユーザーを消し合う。
 */
const USER = {
  email: runScopedEmail('e2e-two-factor'),
  password: 'TwoFactorE2e1',
} as const;

/** 作成したユーザーのID（totp_verify のレート制限は user_id で数える） */
let userId = '';

/** ログイン画面でメールとパスワードを入力して送信する */
async function submitCredentials(page: Page): Promise<void> {
  await page.getByLabel('メールアドレス').fill(USER.email);
  await page.getByLabel('パスワード').fill(USER.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
}

/** ログインして設定画面を開く */
async function loginAndOpenSettings(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await submitCredentials(page);
  await page.waitForURL('/');
  await page.goto('/settings');
}

/**
 * 設定画面で二段階認証を有効化する
 *
 * @returns 画面に表示されたリカバリーコード
 */
async function enableTwoFactor(page: Page): Promise<string[]> {
  await page.getByRole('button', { name: '二段階認証を設定する' }).click();

  // QRが出た時点で共有鍵がDBに入る。認証アプリで読み取る操作の代わり
  await expect(
    page.getByRole('img', { name: '二段階認証のQRコード' }),
  ).toBeVisible();

  const secret = await getTotpSecret(USER.email);
  expect(secret).not.toBeNull();

  await page.getByLabel('認証コード').fill(totpCodeFromSecret(secret!));
  await page.getByRole('button', { name: '二段階認証を有効にする' }).click();

  // リカバリーコードは発行時に一度しか表示されない
  const codeList = page.getByRole('list', { name: 'リカバリーコード' });
  await expect(codeList).toBeVisible();

  return (await codeList.getByRole('listitem').allInnerTexts()).map((text) =>
    text.trim(),
  );
}

/**
 * 本 spec 内のテストは同じ専用ユーザーの二段階認証を有効化・無効化するため、
 * 互いに干渉する。ファイル内は直列で回す。
 *
 * 1テストあたりログインを2回行う（有効化 → ログアウト → 二段階認証付きログイン）
 * ものがあり、bcrypt とDB往復で既定の30秒では足りない。
 */
test.describe.configure({ mode: 'serial', timeout: 90000 });

test.describe('二段階認証', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    userId = await createVerifiedUser(USER);
  });

  test.afterAll(async () => {
    // 関連レコード（user_totp / totp_recovery_codes）は ON DELETE CASCADE で消える
    await deleteUserByEmail(USER.email);
  });

  /**
   * 専用ユーザーに紐づく状態だけを消す。
   * run 全体を対象にする cleanupRunRateLimits は、他の spec が依存する状態まで
   * 壊すため使わない（#750）。
   */
  const resetUserState = async (): Promise<void> => {
    // ログイン5回/30分、コード5回/15分。持ち越すと後半のテストが弾かれる
    await cleanupRateLimitsForEmail(USER.email);
    await cleanupRateLimitsForUser(userId);
    // 送信元IP単位の上限（20回/15分）はユーザーに紐づかず全 spec で共有される。
    // 本 spec は1テストあたり最大3回ログインするため、他の spec と重なると到達する
    await cleanupLoginIpRateLimits();
    // 直前のOTPが残っていると再送間隔（60秒）に引っかかって送信できない
    await cleanupOtpCodesForEmail(USER.email);
    await cleanupTotp(USER.email);
  };

  test.beforeEach(resetUserState);
  test.afterEach(resetUserState);

  test('有効化 → ログアウト → 認証コード付きでログインできる', async ({
    page,
  }) => {
    await loginAndOpenSettings(page);
    await enableTwoFactor(page);

    // 控えて有効状態へ
    await page
      .getByRole('button', { name: 'リカバリーコードを控えた' })
      .click();
    await expect(page.getByText('二段階認証は')).toBeVisible();

    await page.context().clearCookies();
    await page.goto('/auth/signin');

    // パスワードだけでは通らず、認証コードの入力欄が出る
    await submitCredentials(page);
    const totpField = page.getByLabel('認証コード');
    await expect(totpField).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);

    const code = await getCurrentTotpCode(USER.email);
    await totpField.fill(code!);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('リカバリーコードでログインできる', async ({ page }) => {
    await loginAndOpenSettings(page);
    const recoveryCodes = await enableTwoFactor(page);

    expect(recoveryCodes.length).toBeGreaterThan(0);
    // 表示された平文が実際に保存されているものと対応している
    expect(await isRecoveryCodeStored(USER.email, recoveryCodes[0])).toBe(true);

    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await submitCredentials(page);

    await page.getByLabel('認証コード').fill(recoveryCodes[0]);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await page.waitForURL('/');

    // 使い捨てなので、同じコードの2回目は通らない
    expect(await isRecoveryCodeStored(USER.email, recoveryCodes[0])).toBe(
      false,
    );
  });

  test('誤った認証コードではログインできない', async ({ page }) => {
    await loginAndOpenSettings(page);
    await enableTwoFactor(page);

    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await submitCredentials(page);

    await page.getByLabel('認証コード').fill('000000');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await expect(
      page.getByRole('alert').filter({
        hasText: '認証コードが正しくありません。',
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('同じ認証コードは2回使えない', async ({ page }) => {
    // コードは30秒有効。記録しないと盗み見られたコードをその間なんどでも使える
    await loginAndOpenSettings(page);
    await enableTwoFactor(page);

    const code = await getCurrentTotpCode(USER.email);

    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await submitCredentials(page);
    await page.getByLabel('認証コード').fill(code!);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await page.waitForURL('/');

    // 同じコードでもう一度
    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await submitCredentials(page);
    await page.getByLabel('認証コード').fill(code!);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: '使用済み' }),
    ).toBeVisible();
  });

  test('二段階認証が有効ならメールOTP単独ログインを使えない', async ({
    page,
  }) => {
    // メールのコードだけで入れる経路は第2要素ではなくパスワードの代替であり、
    // 残すと最も弱い経路が全体の強度を決めてしまう（#642）
    await loginAndOpenSettings(page);
    await enableTwoFactor(page);

    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: 'メールでログイン' }).click();

    await page.getByLabel('メールアドレス').fill(USER.email);
    await page.getByRole('button', { name: 'ログインコードを送信' }).click();
    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();

    const otpCode = await getLatestOtpCode(USER.email, 'login');
    // exact 指定が無いと「確認コードを検証」ボタンにも一致する
    await page.getByLabel('確認コード', { exact: true }).fill(otpCode!);

    // signIn の結果を待ってから表示を確認する。クリック直後に assert すると
    // 応答前の状態を見てしまう（signin.spec.ts と同じ待ち方）
    const authPromise = page.waitForResponse(
      (res) => res.url().includes('/api/auth/callback') && res.status() < 500,
    );
    await page.getByRole('button', { name: '確認コードを検証' }).click();
    await authPromise;

    await expect(
      page.getByRole('alert').filter({
        hasText: '二段階認証が有効なため、メールでのログインは利用できません',
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('所持の証明なしでは無効化できない', async ({ page }) => {
    // セッションだけで外せたら、セッションを奪った第三者が第2要素を無効化できる
    await loginAndOpenSettings(page);
    await enableTwoFactor(page);
    await page
      .getByRole('button', { name: 'リカバリーコードを控えた' })
      .click();

    await page.getByLabel('認証コード').fill('000000');
    await page.getByRole('button', { name: '二段階認証を無効にする' }).click();

    await expect(
      page.getByRole('alert').filter({
        hasText: '認証コードが正しくありません。',
      }),
    ).toBeVisible();
    // 有効なまま
    await expect(
      page.getByRole('button', { name: '二段階認証を無効にする' }),
    ).toBeVisible();
  });

  test('認証コードを入力すると無効化できる', async ({ page }) => {
    await loginAndOpenSettings(page);
    await enableTwoFactor(page);
    await page
      .getByRole('button', { name: 'リカバリーコードを控えた' })
      .click();

    const code = await getCurrentTotpCode(USER.email);
    await page.getByLabel('認証コード').fill(code!);
    await page.getByRole('button', { name: '二段階認証を無効にする' }).click();

    await expect(
      page.getByRole('button', { name: '二段階認証を設定する' }),
    ).toBeVisible();

    // 無効化後はパスワードだけでログインできる
    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await submitCredentials(page);

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });
});
