/**
 * 第2要素の入力画面 E2Eテスト（#1162）
 *
 * `/auth/two-factor` は **E2E で一度も開かれていなかった**。既存の
 * `twoFactor.spec.ts` は Credentials 経路しか踏まず、その経路のコード入力欄は
 * `/auth/signin` の中にあるため、この画面へは遷移しない。
 *
 * その結果、#1150（OAuth＋二段階認証でコード入力画面を開いた瞬間に
 * セッションCookieが削除され、ログインを完走できない）が CI を素通りした。
 *
 * ⚠️ **実プロバイダの往復は回さない。** `totpPending` になるのは OAuth 経路
 * だけだが、検証したいのはその後の proxy・画面・jwt コールバックであって
 * プロバイダ側ではない。NextAuth と同じ鍵でトークンを作って Cookie に
 * 差し込む（`helpers/sessionToken.ts`）。
 *
 * ユーザーストーリー網羅:
 * - 正常系: 認証コードを入れるとログインが完走する
 * - 認証・認可: 第2要素が済むまで、保護ページ・公開ページ・adminのどれにも行けない
 * - 状態保持: 画面を開いてもセッションCookieが消えない（#1150 の回帰）
 * - エラー応答: 誤ったコードでは進めず、画面に留まる
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '@/constants';

import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForEmail,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';
import {
  resolveSessionCookie,
  seedTotpPendingSession,
} from '../helpers/sessionToken';
import {
  cleanupTotp,
  getTotpSecret,
  totpCodeFromSecret,
} from '../helpers/totp';

/**
 * 本 spec 専用のユーザー。
 *
 * `twoFactor.spec.ts` と同じく共有の TEST_USER は使わない。二段階認証を
 * 有効化してユーザーの状態を書き換えるため、並列実行で他を壊す（#750）。
 */
const USER = {
  email: runScopedEmail('e2e-totp-challenge'),
  password: 'TotpChallengeE2e1',
} as const;

/**
 * 「別のアカウント」役（#1161）
 *
 * 抜ける導線の検証で、ログアウト後に**実際に別アカウントでログインできる**
 * ことまで見るために要る。共有の TEST_USER は使わない（3ブラウザで奪い合い、
 * ログインのレート制限枠が枯れる）。
 */
const OTHER_USER = {
  email: runScopedEmail('e2e-totp-challenge-other'),
  password: 'TotpChallengeOther1',
} as const;

let userId = '';
let otherUserId = '';

/**
 * コード入力欄
 *
 * ⚠️ `getByLabel('認証コード')` は使えない。送信ボタンの `aria-label` が
 * 「認証コードを確認」で、部分一致して2件になる（strict mode violation）
 */
const totpInput = (page: Page): Locator =>
  page.getByRole('textbox', { name: '認証コード' });

/**
 * ログイン→二段階認証を有効化→`totpPending` のセッションに差し替える
 *
 * 画面から有効化するのは、DBへ直接書くと共有鍵の暗号化手順
 * （HKDF + AES-256-GCM）を二重に持つことになるため。
 */
async function setUpPendingSession(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await page.getByLabel('メールアドレス').fill(USER.email);
  await page.getByLabel('パスワード').fill(USER.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.waitForURL('/');

  await page.goto('/settings');
  await page.getByRole('button', { name: '認証アプリで設定する' }).click();
  await expect(
    page.getByRole('img', { name: '二段階認証のQRコード' }),
  ).toBeVisible();

  const secret = await getTotpSecret(USER.email);
  expect(secret).not.toBeNull();

  await page.getByLabel('認証コード').fill(totpCodeFromSecret(secret!));
  await page.getByRole('button', { name: '二段階認証を有効にする' }).click();
  await expect(
    page.getByRole('list', { name: 'リカバリーコード' }),
  ).toBeVisible();

  // ここまでで「二段階認証が有効なユーザー」と「本物のセッションCookie」が
  // 揃う。あとは値だけ `totpPending` のトークンへ差し替える
  await seedTotpPendingSession(page.context(), {
    id: userId,
    email: USER.email,
  });
}

// 1テストあたりログイン＋有効化＋画面遷移を行う。bcrypt とDB往復で
// 既定の30秒では足りない
test.describe.configure({ mode: 'serial', timeout: 90000 });

test.describe('第2要素の入力画面', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    userId = await createVerifiedUser(USER);
    otherUserId = await createVerifiedUser(OTHER_USER);
  });

  test.afterAll(async () => {
    await deleteUserByEmail(USER.email);
    await deleteUserByEmail(OTHER_USER.email);
  });

  const resetUserState = async (): Promise<void> => {
    await cleanupRateLimitsForEmail(USER.email);
    await cleanupRateLimitsForUser(userId);
    await cleanupRateLimitsForEmail(OTHER_USER.email);
    await cleanupRateLimitsForUser(otherUserId);
    await cleanupLoginIpRateLimits();
    await cleanupTotp(USER.email);
  };

  test.beforeEach(resetUserState);
  test.afterEach(resetUserState);

  /**
   * #1150 の回帰
   *
   * 修正前は、この画面を開いた瞬間に proxy がセッションCookieを削除していた。
   * 「cookieはあるがJWT検証に失敗」の分岐に落ちていたため
   * （`totpPending` のセッションは `user.id` が空になる）。
   *
   * ⚠️ 画面が出ることだけを見ても検知できない。Cookie 削除の分岐は
   * `NextResponse.next()` を返すので、リダイレクトされず画面は普通に出る。
   * **Cookie が残っていること**まで見る必要がある
   */
  test('コード入力画面を開いてもセッションCookieが消えない', async ({
    page,
  }) => {
    await setUpPendingSession(page);

    const response = await page.goto(ROUTES.TOTP_CHALLENGE);
    await expect(totpInput(page)).toBeVisible();

    // ⚠️ **レスポンスヘッダで見る。**「削除指示が出ていないこと」を直接
    // 確かめたいのであって、壺の中身は結果でしかない。
    //
    // 空値への上書き（`<name>=;`）が削除指示。発行時は
    // `<name>=eyJ...` なのでマッチしない
    const setCookie = (await response!.headerValues('set-cookie')).join('\n');
    expect(setCookie).not.toMatch(/next-auth\.session-token=;/);

    // 壺のほうも見ておく。
    //
    // ⚠️ 以前は「proxy の `cookies.delete()` は `Secure` を付けないので
    // production ではブラウザが拒否し、壺に残っていても削除されなかった
    // 証明にならない」と書いていたが、**#1174 でそこを直したので
    // この但し書きはもう成立しない**。いまは属性付きで返るため、
    // 壺のアサーションも本物の回帰検知器になっている
    await expect(resolveSessionCookie(page.context())).resolves.toBeDefined();
  });

  test('第2要素が済むまで他の画面へ行けない', async ({ page }) => {
    await setUpPendingSession(page);

    // 保護ページ・公開ページ・admin のいずれも同じ画面へ戻される。
    // どれか1つでも通ると、第2要素を回避してアプリを使えることになる
    for (const path of [
      ROUTES.WATCHLIST,
      ROUTES.HOME,
      ROUTES.PRIVACY,
      ROUTES.ADMIN_ACCOUNTS,
    ]) {
      // `goto` がリダイレクト完走まで待つので `waitForURL` は要らない。
      // 使うと、URL が違うだけなのに「Test timeout」に化けて原因が見えなくなる
      // （`navigationTimeout` 未設定＝無制限のため）
      await page.goto(path);
      await expect(page).toHaveURL(ROUTES.TOTP_CHALLENGE);
      await expect(totpInput(page)).toBeVisible();
    }
  });

  test('認証コードを入れるとログインが完走する', async ({ page }) => {
    await setUpPendingSession(page);

    await page.goto(ROUTES.TOTP_CHALLENGE);

    const secret = await getTotpSecret(USER.email);
    expect(secret).not.toBeNull();

    await totpInput(page).fill(totpCodeFromSecret(secret!));
    await page.getByRole('button', { name: '認証コードを確認' }).click();

    await page.waitForURL('/');

    // 第2要素が済んだので、今度は保護ページへ行ける
    await page.goto(ROUTES.WATCHLIST);
    await expect(page).toHaveURL(ROUTES.WATCHLIST);
  });

  test('誤ったコードでは進めず、画面に留まる', async ({ page }) => {
    await setUpPendingSession(page);

    await page.goto(ROUTES.TOTP_CHALLENGE);

    await totpInput(page).fill('000000');
    await page.getByRole('button', { name: '認証コードを確認' }).click();

    // ⚠️ 「URLが変わらない」だけでは足りない。ハイドレーション前の fill で
    // 値が巻き戻り、`useTwoFactorChallenge.ts` の空文字ガードで早期 return
    // しても同じ結果になる。**拒否されたこと**を文言で確かめる
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: '認証コードが正しくありません。' }),
    ).toBeVisible();
    await expect(page).toHaveURL(ROUTES.TOTP_CHALLENGE);
    // ここでセッションが壊れていると、正しいコードを入れても復帰できない
    await expect(resolveSessionCookie(page.context())).resolves.toBeDefined();
  });

  /**
   * この画面からの出口（#1161）
   *
   * `totpPending` のセッションは proxy が他のすべての画面から押し戻すため、
   * 修正前はこの画面が袋小路だった。認証アプリが手元に無い利用者は、
   * Cookie を手で消すまで公開ページも別アカウントのログインも使えなかった。
   */
  test('キャンセルするとログアウトでき、袋小路から抜けられる', async ({
    page,
  }) => {
    await setUpPendingSession(page);

    await page.goto(ROUTES.TOTP_CHALLENGE);
    await expect(totpInput(page)).toBeVisible();

    const cancel = page.getByRole('button', {
      name: 'キャンセルしてログアウト',
    });
    await expect(cancel).toBeEnabled();
    await cancel.click();

    await page.waitForURL(ROUTES.LOGIN);

    // セッションそのものが消えている。残っていると proxy がまた押し戻す。
    // ⚠️ メッセージで固定する。`resolveSessionCookie` はコンテキスト破棄など
    // 別の理由でも throw するので、素の `rejects.toThrow()` だと
    // 「Cookie が消えた」以外でも通ってしまう
    await expect(resolveSessionCookie(page.context())).rejects.toThrow(
      /セッションCookieが見つかりません/,
    );

    // 未ログインとして公開ページを閲覧できる（修正前は同じ画面へ戻された）
    await page.goto(ROUTES.PRIVACY);
    await expect(page).toHaveURL(ROUTES.PRIVACY);

    // 別のアカウントでログインできる
    await page.goto(ROUTES.LOGIN);
    await page.getByLabel('メールアドレス').fill(OTHER_USER.email);
    await page.getByLabel('パスワード').fill(OTHER_USER.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await page.waitForURL('/');
    await expect(resolveSessionCookie(page.context())).resolves.toBeDefined();
  });
});
