/**
 * ログイン E2Eテスト
 * クリティカルユーザージャーニーのみ（バリデーション・UI表示は結合テストに移行済み）
 */

import { test, expect } from '@playwright/test';

import { TEST_USER } from '../helpers/testUser';
import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForEmail,
} from '../helpers/dedicatedUser';

test.describe('ログイン認証フロー', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /*
    ⚠️ レート制限を消してから始める（#1254）。

    以前はレート制限に当たっても「メールアドレスまたはパスワードが
    正しくありません」に丸められていたため、下の「不正な認証情報」テストは
    **制限に当たっていても通って**いた。理由を返すようにした結果、当たると
    「しばらく時間をおいてから」に変わって落ちる。

    `login_ip` は 20回/15分で shard 内の全 spec が共有するので、
    メールアドレス単位だけでは足りない
  */
  test.beforeEach(async () => {
    await cleanupRateLimitsForEmail(TEST_USER.email);
    await cleanupLoginIpRateLimits();
  });

  test('正常なログインでホームにリダイレクトされる', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByLabel('メールアドレス').fill(TEST_USER.email);
    await page.getByLabel('パスワード').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('保護ページへの未認証アクセス後、ログインすると元のページへ戻る', async ({
    page,
  }) => {
    // 未認証で保護ページにアクセス → callbackUrl付きでサインインへリダイレクト
    await page.goto('/watchlist');
    await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=/);

    await page.getByLabel('メールアドレス').fill(TEST_USER.email);
    await page.getByLabel('パスワード').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    // ホームではなく元の保護ページに戻る
    await page.waitForURL('/watchlist');
    await expect(page).toHaveURL('/watchlist');
  });

  test('不正な認証情報でエラーメッセージが表示される', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByLabel('メールアドレス').fill('wrong@example.com');
    await page.getByLabel('パスワード').fill('WrongPassword123');

    const authPromise = page.waitForResponse(
      (res) => res.url().includes('/api/auth/callback') && res.status() < 500,
    );
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await authPromise;

    await expect(
      page.getByRole('alert').filter({
        hasText: 'メールアドレスまたはパスワードが正しくありません。',
      }),
    ).toBeVisible();
  });
});

test.describe('認証済みユーザーのリダイレクト', () => {
  test('認証済みユーザーがログインページにアクセスするとホームにリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/auth/signin');

    await expect(page).toHaveURL('/');
  });
});
