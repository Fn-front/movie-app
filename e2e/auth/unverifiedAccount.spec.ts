/**
 * メール認証が未完了のまま戻ってきた利用者 E2E（#1247）
 *
 * 新規登録したあと、確認コードを入れる前に画面を離れた人のストーリー。
 * 確認コードの入力画面はリロードすると二度と出せず、コードの有効期限も
 * 10分しかないため、現実によく起きる。
 *
 * 以前は**3つの経路すべてが本当の理由を伝えなかった**:
 *
 * - パスワードログイン → 「パスワードが正しくありません」（パスワードは正しい）
 * - メールでログイン → 同上（この画面にはパスワード欄すら無い）
 * - パスワード再設定 → 「送信しました」（1通も送らない）
 *
 * ユーザーストーリー網羅:
 * - 認証・認可: 未認証アカウントでのログインが拒否される
 * - エラー応答: 拒否の**理由**と次の手順が画面に出る
 * - セキュリティ: パスワードを知らない相手には理由を明かさない（列挙防止）
 * - 状態保持: 再設定画面に「この画面では復旧できない」案内が出ている
 */

import { test, expect } from '@playwright/test';

import { AUTH_ERROR_MESSAGES } from '../../src/constants/auth';
import { PASSWORD_RESET_MESSAGES } from '../../src/constants/passwordReset';
import {
  createUnverifiedUser,
  deleteUserByEmail,
  cleanupRateLimitsForEmail,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';

const UNVERIFIED = {
  email: runScopedEmail('e2e-unverified'),
  password: 'UnverifiedPass1',
};

/**
 * 画面のエラー表示だけに絞る
 *
 * Next.js のルートアナウンサー（`#__next-route-announcer__`）も
 * `role='alert'` を持つため、素の `getByRole('alert')` は複数要素に当たる。
 * jsdom には存在しないので単体テストでは気づけない
 */
const errorAlert = (page: import('@playwright/test').Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

/**
 * ⚠️ 直列で動かす
 *
 * `fullyParallel: true` のため、既定では同じファイルのテストも別ワーカーで
 * 同時に走る。全員が同じメールアドレスのユーザーを作ろうとして 409
 * （重複）で落ちる。`twoFactor.spec.ts:111` と同じ形
 */
test.describe.configure({ mode: 'serial' });

test.describe('メール認証が未完了のアカウント', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    await createUnverifiedUser(UNVERIFIED);
  });

  test.beforeEach(async () => {
    // 前のテストのログイン試行がレート制限に残っていると、理由ではなく
    // 「しばらく時間をおいて」が出て検証にならない
    await cleanupRateLimitsForEmail(UNVERIFIED.email);
  });

  test.afterAll(async () => {
    await deleteUserByEmail(UNVERIFIED.email);
  });

  test('パスワードが正しければ、理由と次の手順が出る', async ({ page }) => {
    await page.goto('/auth/signin');

    await page
      .getByLabel('メールアドレスまたはアカウント名')
      .fill(UNVERIFIED.email);
    await page.getByLabel('パスワード').fill(UNVERIFIED.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await expect(errorAlert(page).first()).toHaveText(
      AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED,
    );
    // ログインは通らない
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  /**
   * ⚠️ 列挙対策
   *
   * これが崩れると、パスワードを知らない相手に「このメールアドレスは
   * 登録済み」が分かる
   */
  test('パスワードが誤っていれば理由を明かさない', async ({ page }) => {
    await page.goto('/auth/signin');

    await page
      .getByLabel('メールアドレスまたはアカウント名')
      .fill(UNVERIFIED.email);
    await page.getByLabel('パスワード').fill('WrongPassword1');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await expect(errorAlert(page).first()).toHaveText(
      AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
    );
  });

  test('再設定画面に、この画面では復旧できないことが書いてある', async ({
    page,
  }) => {
    // サーバーは列挙防止のため黙って捨てる。「送信しました」と出たまま
    // 永久に届かないので、送信の前後どちらでも分かるようにする
    await page.goto('/auth/forgot-password');

    await expect(
      page.getByText(PASSWORD_RESET_MESSAGES.UNVERIFIED_ACCOUNT_NOT_SUPPORTED),
    ).toBeVisible();

    await page.getByLabel('メールアドレス').fill(UNVERIFIED.email);
    await page.getByRole('button', { name: '再設定リンクを送信' }).click();

    await expect(
      page.getByText(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED),
    ).toBeVisible();
    await expect(
      page.getByText(PASSWORD_RESET_MESSAGES.UNVERIFIED_ACCOUNT_NOT_SUPPORTED),
    ).toBeVisible();
  });
});
