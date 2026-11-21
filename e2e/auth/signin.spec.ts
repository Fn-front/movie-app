/**
 * ログイン E2Eテスト
 * クリティカルユーザージャーニーのみ（バリデーション・UI表示は結合テストに移行済み）
 */

import { test, expect } from '@playwright/test';

import { TOAST_MESSAGES, TOAST_TITLES } from '../../src/constants/auth';
import { TEST_USER } from '../helpers/testUser';
import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForEmail,
} from '../helpers/dedicatedUser';

/**
 * 成功トーストの本体に絞る
 *
 * ⛔ 文字列で引かない。Radix Toast は読み上げ用に
 * `<span role="status">Notification ログイン成功<文面></span>` を**別に描く**
 * ので、`getByText(<文面>)` は2件に解決して strict mode violation になる
 * （実測）。読み上げ用は1秒で消えるため、**通る回と落ちる回が出る**。
 *
 * Toast Root は Viewport（`<ol>`）の中の `<li>`。見出しで絞れば1件になる。
 */
const successToast = (page: import('@playwright/test').Page) =>
  page.getByRole('listitem').filter({ hasText: TOAST_TITLES.LOGIN_SUCCESS });

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

    // 行き先がホームのときは、従来どおりホームだと伝える（#1385）
    await expect(successToast(page)).toContainText(
      TOAST_MESSAGES.LOGIN_SUCCESS_DESCRIPTION,
    );
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

    /*
      ⛔ **文面も行き先に合わせる（#1385）。** 以前は固定で「ホーム画面に
      移動します。」だった。着いているのはウォッチリストなので、見えている
      画面と読み上げが食い違う。

      ⚠️ 着地してから見る。トーストは遷移の直前に出るが、ToastProvider は
      ルートに常駐するので push をまたいで残る（表示は5秒 /
      `ANIMATION.TOAST_DURATION`）。
    */
    const toast = successToast(page);
    await expect(toast).toContainText(
      TOAST_MESSAGES.LOGIN_SUCCESS_REDIRECT_DESCRIPTION,
    );

    /*
      ⚠️ **トーストだけを撮る。** ページ全体だと、着地直後の再取得と重なって
      本文が空のまま写る回がある（実測）。証跡に要るのは文面なので、
      トーストに絞れば毎回同じ絵になる。
    */
    await toast.screenshot({
      path: 'docs/tmp/e2e-screenshots/signin-callback-toast.png',
    });
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

  /**
   * ⛔ **メールOTPログインの導線を戻さない**（#1361）
   *
   * 受信箱を押さえられるとパスワードを知らなくてもログインできる経路で、
   * パスワード再設定と二重に存在していた。消しても復旧手段は残る。
   *
   * ⚠️ 単体テストだけでは足りない。`LoginForm` から消しても、別の画面に
   * 導線を足し直せば単体テストは緑のまま通る。
   */
  test('メールでログインの導線が無い', async ({ page }) => {
    await page.goto('/auth/signin');

    await expect(
      page.getByRole('button', { name: 'ログイン', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'メールでログイン' }),
    ).toHaveCount(0);

    // 再設定の導線は残す。これが唯一の復旧経路になった
    await expect(
      page.getByRole('link', { name: 'パスワードをお忘れの方' }),
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
