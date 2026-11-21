/**
 * ソーシャルログイン（Google/GitHub） 表示確認 E2Eテスト（未認証）
 *
 * SSO の往復（実プロバイダでの認可・コールバック）は外部依存のため E2E では検証しない。
 * E2E は「入口」＝ signin/signup 両ページにソーシャルログインボタンが表示・操作可能で
 * あることまでを担保する。認可フローの往復ロジック（NextAuth の signIn/jwt/session
 * callback、新規/既存ユーザー紐付け）は結合/単体テストで検証する（別Issueで管理）。
 *
 * ユーザーストーリー網羅:
 * - 正常系（表示）: signin にGoogle/GitHubログインボタンが表示され、操作可能
 * - 正常系（表示）: signup にGoogle/GitHubログインボタンが表示され、操作可能
 * - エラー応答: 失敗して `?error=` で戻されたとき、理由が画面に出る（#1242）
 * - 状態保持: 表示後に `?error=` が URL から落ち、リロードで蘇らない
 * - セキュリティ: 知らないコードでも落とさず既定の文言に倒す
 * - 状態保持（戻り先）: 失敗したあとに元のページへ戻れる（#1246 / #1293）
 */

import { test, expect, type Page } from '@playwright/test';

import { SIGN_IN_PAGE_ERROR_MESSAGES } from '../../src/constants/auth';
import { PENDING_CALLBACK_URL_KEY } from '../../src/features/auth/utils/pendingCallbackUrl';
import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForEmail,
  createVerifiedUser,
  deleteUserByEmail,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';

test.describe('ソーシャルログイン 表示確認（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('ログインページにGoogle/GitHubログインボタンが表示される', async ({
    page,
  }) => {
    await page.goto('/auth/signin');

    const google = page.getByRole('button', { name: 'Googleでログイン' });
    const github = page.getByRole('button', { name: 'GitHubでログイン' });

    await expect(google).toBeVisible();
    await expect(google).toBeEnabled();
    await expect(github).toBeVisible();
    await expect(github).toBeEnabled();
  });

  test('新規登録ページにGoogle/GitHubログインボタンが表示される', async ({
    page,
  }) => {
    await page.goto('/auth/signup');

    const google = page.getByRole('button', { name: 'Googleでログイン' });
    const github = page.getByRole('button', { name: 'GitHubでログイン' });

    await expect(google).toBeVisible();
    await expect(google).toBeEnabled();
    await expect(github).toBeVisible();
    await expect(github).toBeEnabled();
  });

  /**
   * 失敗して戻されたときに理由が出る（#1242）
   *
   * Auth.js は `kind = 'signIn'` の失敗を `/auth/signin?error=` へ戻す。
   * 読んでいなかったため「押したのに何も起きずログイン画面に戻された」
   * ように見えていた。
   *
   * 実プロバイダの往復は要らない。`?error=` を直接開けば同じ状態になる
   */
  test.describe('失敗して戻されたとき', () => {
    /**
     * 画面のエラー表示だけに絞る
     *
     * Next.js のルートアナウンサー（`#__next-route-announcer__`）も
     * `role='alert'` を持つため、素の `getByRole('alert')` は2要素に当たって
     * strict mode violation になる。jsdom には存在しないので単体テストでは
     * 気づけない。
     *
     * ⚠️ `filter({ hasText: /\S/ })`（`changePassword.spec.ts:263-267` の形）
     * では足りない。ここは `router.replace` でクライアント遷移を起こすため、
     * **アナウンサーにページタイトルが入って中身を持つ**。単独実行では空の
     * まま通り、全件実行で落ちるという質の悪い形になる。ID で確実に外す
     */
    const errorAlert = (page: import('@playwright/test').Page) =>
      page.locator('[role="alert"]:not(#__next-route-announcer__)');

    test('理由が画面に表示される', async ({ page }) => {
      await page.goto('/auth/signin?error=OAuthCallbackError');

      await expect(errorAlert(page)).toHaveText(
        SIGN_IN_PAGE_ERROR_MESSAGES.OAuthCallbackError,
      );
    });

    test('知らないコードでも落ちず、既定の文言になる', async ({ page }) => {
      // `?error=` は URL に書くだけで誰でも踏める。`__proto__` は
      // 素の添字参照だとオブジェクトが返り、描画ごと落ちる（#1240）
      await page.goto('/auth/signin?error=__proto__');

      await expect(errorAlert(page)).toHaveText(
        SIGN_IN_PAGE_ERROR_MESSAGES.DEFAULT,
      );
      // 落ちていれば見出しごと消える
      await expect(
        page.getByRole('heading', { name: 'ログイン' }),
      ).toBeVisible();
    });

    test('表示後に ?error= が URL から落ち、リロードで蘇らない', async ({
      page,
    }) => {
      // MissingCSRF の文言は「再読み込みしてください」。クエリが残っていると
      // 言われたとおりにしても同じ画面に戻り続ける
      await page.goto(
        '/auth/signin?error=MissingCSRF&callbackUrl=%2Fwatchlist',
      );

      await expect(errorAlert(page)).toHaveText(
        SIGN_IN_PAGE_ERROR_MESSAGES.MissingCSRF,
      );

      // URL からは消えるが、表示中の文言はそのまま残す
      await expect(page).toHaveURL(/\?callbackUrl=%2Fwatchlist$/);
      await expect(errorAlert(page)).toBeVisible();

      await page.reload();

      await expect(
        page.getByRole('heading', { name: 'ログイン' }),
      ).toBeVisible();
      await expect(errorAlert(page)).toHaveCount(0);
    });
  });
});

/**
 * 失敗したあとに元のページへ戻れる（#1246 / #1293）
 *
 * ⛔ Auth.js は失敗時のリダイレクトに `error` と `code` しか載せないため
 * （`@auth/core/index.js:132-137`）、`proxy.ts` が付けた `callbackUrl` は
 * OAuth の往復で消える。`/watchlist` を見ようとして誘導された人が、
 * ログインし直すとホームに着地していた。
 *
 * ⚠️ OAuth の往復そのものは実プロバイダが要るので再現できない。
 * **往復の前後をそれぞれ組み立てる**。
 *
 * ⚠️ この領域は単体テストで取りこぼす。`signInContent.tsx:102-108` 自身が
 * 「jsdom では `router.replace` がモックなので気づけない」と書いているとおりで、
 * #1242 は本番ビルドの E2E で初めて検知している。
 *
 * ユーザーストーリー網羅:
 * - 状態保持: ソーシャルを押した時点で戻り先が預けられる
 * - 状態保持: 失敗して戻されたあと、パスワードでログインすると元の場所へ着地する
 * - 状態保持: `/auth/error` 経由でも戻り先が引き継がれる
 */
test.describe('ソーシャルログイン失敗後の戻り先', () => {
  /**
   * ⚠️ **直列にする。** 既定の `fullyParallel` だと describe 内のテストが
   * 別ワーカーへ散り、`beforeAll` / `afterAll` が**ワーカーごとに**走る。
   * 専用ユーザーを共有しているので、先に終わったワーカーの `afterAll` が
   * 実行中のテストのユーザーを消し、「メールアドレスまたはパスワードが
   * 正しくありません。」で落ちる（実測）。
   */
  test.describe.configure({ mode: 'serial' });

  test.use({ storageState: { cookies: [], origins: [] } });

  /** 誘導元のページ。認証が要るので `proxy.ts` が `callbackUrl` を付ける */
  const PROTECTED_PATH = '/watchlist';

  /**
   * 本 spec 専用のユーザー
   *
   * 共有の `TEST_USER` を使うと、ログイン試行のカウンタを他の spec と
   * 食い合う（#750 と同じ理由）。
   */
  const USER = {
    email: runScopedEmail('e2e-social-callback'),
    password: 'SocialCallbackE2e1',
  } as const;

  test.beforeAll(async () => {
    await createVerifiedUser(USER);
  });

  test.afterAll(async () => {
    await deleteUserByEmail(USER.email);
  });

  test.beforeEach(async () => {
    // 送信元IP単位の上限（20回/15分）はユーザーに紐づかず全 spec で共有される
    await cleanupRateLimitsForEmail(USER.email);
    await cleanupLoginIpRateLimits();
  });

  /** ログイン画面でメールとパスワードを入力して送信する */
  const submitCredentials = async (page: Page): Promise<void> => {
    await page.getByLabel('メールアドレス').fill(USER.email);
    await page.getByLabel('パスワード').fill(USER.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  };

  /**
   * 「預かっている」状態を作る
   *
   * OAuth の往復を挟めないので、プロバイダから失敗して戻ってきた直後と
   * 同じ `sessionStorage` の状態を直接作る。
   */
  const seedPendingCallbackUrl = async (page: Page): Promise<void> => {
    // 同一オリジンでないと `sessionStorage` を触れない
    await page.goto('/auth/signin');
    await page.evaluate(
      ([key, value]) => window.sessionStorage.setItem(key, value),
      [PENDING_CALLBACK_URL_KEY, PROTECTED_PATH] as const,
    );
  };

  /**
   * 1. ソーシャルを押した時点で戻り先が預けられる
   *
   * ⚠️ プロバイダへの遷移は握りつぶす。飛んでしまうと別オリジンになり、
   * `sessionStorage` を読めない。`savePendingCallbackUrl` は `signIn()` を
   * 待つ前に走るので、遷移を止めても預け入れは観測できる。
   */
  test('ソーシャルログインを始めると戻り先が預けられる', async ({ page }) => {
    await page.route(
      /^https:\/\/(accounts\.google\.com|github\.com)\//,
      (route) => route.abort(),
    );

    await page.goto(
      `/auth/signin?callbackUrl=${encodeURIComponent(PROTECTED_PATH)}`,
    );
    await page.getByRole('button', { name: 'Googleでログイン' }).click();

    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          PENDING_CALLBACK_URL_KEY,
        ),
      )
      .toBe(PROTECTED_PATH);
  });

  /**
   * 2. 失敗して戻されたあと、パスワードでログインすると元の場所へ着地する
   *
   * ⛔ ここが #1246 の本題。ホームに着地していると、利用者は自分が何を
   * 見ようとしていたか辿り直すことになる。
   */
  test('失敗後にパスワードでログインすると元のページへ戻る', async ({
    page,
  }) => {
    /**
     * ⚠️ **dev では通らない（#1383）。** StrictMode が effect を2回走らせ、
     * `takePendingCallbackUrl()` が**読むと同時に消す**ため、2回目は
     * `undefined` で state を上書きする（`signInContent.tsx:83-89`）。
     * 製品側の問題であってテストの都合ではないので、#1383 を直したら
     * このスキップを外すこと。
     *
     * ⚠️ `CI` は Playwright の webServer が `npm start`（本番ビルド）に
     * なる条件そのもの（`playwright.config.ts:212`）。CI だけでなく、
     * 手元で `CI=true` を付けたときも走る。
     */
    test.skip(
      !process.env.CI,
      '本番ビルドでのみ通る（#1383。dev は StrictMode で戻り先が失われる）',
    );

    await seedPendingCallbackUrl(page);

    // プロバイダから失敗して戻された状態。`callbackUrl` は載っていない
    await page.goto('/auth/signin?error=OAuthCallbackError');
    await expect(
      page.getByText(SIGN_IN_PAGE_ERROR_MESSAGES.OAuthCallbackError),
    ).toBeVisible();

    await submitCredentials(page);

    await page.waitForURL(PROTECTED_PATH);
    await expect(page).toHaveURL(PROTECTED_PATH);
    await page.screenshot({
      path: 'docs/e2e-screenshots/social-login-callback-restored.png',
    });
  });

  /**
   * 3. `/auth/error` 経由でも戻り先が引き継がれる
   *
   * ⚠️ `/auth/signin?error=` 側だけでは足りない。**アプリ自身が拒んだ**
   * ソーシャルログイン（メール未検証・DB障害）は `AccessDenied` で
   * `/auth/error` に来る。戻るリンクが `/auth/signin` 固定だと
   * `?error=` が付かず、`SignInContent` は預かり分を採らない。
   */
  test('/auth/error から戻っても元のページへ着地する', async ({ page }) => {
    await seedPendingCallbackUrl(page);

    await page.goto('/auth/error?error=AccessDenied');

    const backLink = page.getByRole('link', { name: 'ログイン画面へ戻る' });

    // 預かり分がクエリへ載せ替わる（載らないと #1246 がそのまま再現する）
    await expect(backLink).toHaveAttribute(
      'href',
      `/auth/signin?callbackUrl=${encodeURIComponent(PROTECTED_PATH)}`,
    );
    await page.screenshot({
      path: 'docs/e2e-screenshots/social-login-error-back-link.png',
    });

    await backLink.click();
    await submitCredentials(page);

    await page.waitForURL(PROTECTED_PATH);
    await expect(page).toHaveURL(PROTECTED_PATH);
  });
});
