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
 * - エラー応答: そもそも始められなかったとき、失敗が伝わり押し直せる（#1292）
 */

import { test, expect, type Page } from '@playwright/test';

import {
  AUTH_ERROR_MESSAGES,
  SIGN_IN_PAGE_ERROR_MESSAGES,
} from '../../src/constants/auth';
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

  /**
   * そもそも始められなかったとき（#1292）
   *
   * ⛔ 以前は `signIn` に catch が無く、**ボタンが元に戻るだけで何も
   * 起きなかったように見えていた**。押し直しても同じなので、利用者には
   * 原因を知りようがない。
   *
   * ⚠️ 落とすのは **`POST /api/auth/signin/<provider>` だけ**。手前の
   * providers / csrf の取得は `fetchData` が catch して null を返すため
   * reject せず、providers が null だと `/api/auth/error` へ遷移してしまう
   * （`next-auth/react.js`）。ここが唯一 catch へ到達する経路。
   */
  test.describe('ログインを始められなかったとき', () => {
    test('失敗が画面に出て、ボタンは押し直せる', async ({ page }) => {
      await page.goto(
        `/auth/signin?callbackUrl=${encodeURIComponent('/watchlist')}`,
      );

      const google = page.getByRole('button', { name: 'Googleでログイン' });
      await google.waitFor();

      await page.route('**/api/auth/signin/**', (route) =>
        route.abort('failed'),
      );
      await google.click();

      const description = page.getByText(
        AUTH_ERROR_MESSAGES.SOCIAL_LOGIN_START_FAILED,
        { exact: true },
      );
      await expect(description).toBeVisible();

      // ⛔ 預かり分を残さない。往復していないのに戻り先だけ残ると、
      //    次にこの画面へ来た人が身に覚えのない場所へ飛ばされる（#1246）
      await expect
        .poll(() =>
          page.evaluate(
            (key) => window.sessionStorage.getItem(key),
            PENDING_CALLBACK_URL_KEY,
          ),
        )
        .toBeNull();

      // 押したのに何も起きない、にならない（押し直せる）
      await expect(google).toBeEnabled();
      await expect(page).toHaveURL(/\/auth\/signin/);

      await page.getByRole('listitem').filter({ has: description }).screenshot({
        path: 'docs/e2e-screenshots/social-login-start-failed.png',
      });
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
    // ⚠️ プロバイダへの遷移は握りつぶす。飛んでしまうと別オリジンになり、
    //    `sessionStorage` を読めない。`savePendingCallbackUrl` は `signIn()` を
    //    待つ前に走るので、遷移を止めても預け入れは成立する
    //
    // ⛔ **Google ではなく GitHub を押す。** `page.route()` が止められるのは
    //    ブラウザのリクエストだけで、Google は `issuer` しか持たないため
    //    **サーバー側が** `accounts.google.com` へ OIDC ディスカバリを投げる
    //    （`@auth/core/lib/actions/signin/authorization-url.js`）。この spec の
    //    冒頭が「外部依存のため E2E では検証しない」と宣言しているので、
    //    認可URLを直接持つ GitHub を使って外部通信を断つ
    // ⚠️ `abort()` にしない。中断したナビゲーションの巻き戻しが、直後の
    //    `page.goto` を `net::ERR_ABORTED` で道連れにする（実測）。
    //    204 なら「遷移せず今のページに留まる」が正規の挙動になる
    await page.route(/^https:\/\/github\.com\//, (route) =>
      route.fulfill({ status: 204, body: '' }),
    );

    await page.goto(
      `/auth/signin?callbackUrl=${encodeURIComponent(PROTECTED_PATH)}`,
    );

    // ⚠️ プロバイダへの遷移**要求が出るまで**待つ。`signIn()` は csrf 取得を
    //    挟んでから `window.location.href` を書き換えるので、待たずに次の
    //    `page.goto` を始めると後から走った遷移に打ち消され、
    //    `net::ERR_ABORTED` になる（実測）
    const providerRequest = page.waitForRequest(/^https:\/\/github\.com\//);
    await page.getByRole('button', { name: 'GitHubでログイン' }).click();
    await providerRequest;

    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          PENDING_CALLBACK_URL_KEY,
        ),
      )
      .toBe(PROTECTED_PATH);
  };

  /**
   * 1. ソーシャルを押した時点で戻り先が預けられる
   *
   * 預ける経路そのものをテストしている。以降のシナリオもこの手順で
   * 「預かっている状態」を作る。
   *
   * ⛔ **`sessionStorage` へ直接書いて作らない。** 書き込み先に選べる
   * 同一オリジンのページのうち `/auth/signin` は、マウント時に
   * `takePendingCallbackUrl()` で**このキーを消す**唯一のページ
   * （`signInContent.tsx:84`。`initialError` の有無に関わらず呼ぶ）。
   * `page.goto` の既定は `waitUntil: 'load'` でハイドレーションの完了を
   * 待たないため、effect が後から走って書いたそばから消されうる。
   * クリック経由なら**ハイドレーション済みが保証される**うえ、
   * 製品コードの `savePendingCallbackUrl` を通る本物の状態になる。
   */
  test('ソーシャルログインを始めると戻り先が預けられる', async ({ page }) => {
    await seedPendingCallbackUrl(page);
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
    /*
      ⚠️ 以前は dev をスキップしていた（#1383）。StrictMode が effect を
      2回走らせ、`takePendingCallbackUrl()` が**読むと同時に消す**ため、
      2回目の `undefined` が state を上書きしていた。製品側を直したので
      **dev / 本番ビルドの両方で走る**。

      ⛔ スキップを戻さないこと。このテストが dev で落ちたら、それは
      **「effect の2回実行に弱い作りへ戻った」合図**で、テストの都合ではない。

      ⚠️ CI は本番ビルド（`playwright.config.ts` の `webServer.command`）なので、
      **この解除で CI の挙動は変わらない**。効くのは手元の dev 実行だけ。

      ⚠️ 再マウント耐性は別の話で、#1383 では直していない。`sessionStorage`
      から消えたあとに再マウントされれば本番でも戻り先は失われる。
    */
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

  /**
   * 4. 失敗していなければ、預かり分へ飛ばさない
   *
   * ⛔ 復元の**裏側**。`signInContent.tsx:60-67` が設計意図として書いている
   * 「無条件に採ると、ソーシャルログインを始めたまま別タブでログイン画面を
   * 開いた人が**身に覚えのない場所へ飛ばされる**」がこれ。
   *
   * ⚠️ 単体テスト（`signInContent.test.tsx`）にも対応するケースがあるが、
   * あちらは `data-callback` 属性を見るだけで `router.push` はモック。
   * **実際にどこへ着地するか**は E2E でしか分からない。
   *
   * ⚠️ #1383 の修正（`if (!pending) return;`）は、`takePendingCallbackUrl()`
   * を return より前に呼ぶので「採らない場合も消す」を壊していない。
   * 消す処理を早期 return の後ろへ動かすとこのストーリーが退行する。
   */
  test('失敗していなければ古い戻り先へ飛ばされない', async ({ page }) => {
    await seedPendingCallbackUrl(page);

    // `?error=` なし＝失敗して戻されたわけではない
    await page.goto('/auth/signin');
    await submitCredentials(page);

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });
});
