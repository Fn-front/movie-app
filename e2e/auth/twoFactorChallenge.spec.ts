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

let userId = '';

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
  await page.getByRole('button', { name: '二段階認証を設定する' }).click();
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
  });

  test.afterAll(async () => {
    await deleteUserByEmail(USER.email);
  });

  const resetUserState = async (): Promise<void> => {
    await cleanupRateLimitsForEmail(USER.email);
    await cleanupRateLimitsForUser(userId);
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

    // ⚠️ **レスポンスヘッダで見る。** ブラウザの Cookie 壺だけを見ると
    // CI（production）で回帰を検知できない。proxy が呼ぶ
    // `response.cookies.delete(name)` は Next の実装上 `Secure` を付けず
    // （`@edge-runtime/cookies` の delete は options を渡さない）、
    // production の Cookie 名は `__Secure-` 接頭辞付きなので、
    // **ブラウザがその Set-Cookie を拒否して Cookie が残ってしまう**。
    // つまり「壺に残っている」は削除されなかった証明にならない
    const setCookie = (await response!.headerValues('set-cookie')).join('\n');
    expect(setCookie).not.toMatch(/next-auth\.session-token=;/);

    // 壺のほうも見ておく。jwt コールバックの例外で `@auth/core` が消す経路
    // （`sessionStore.clean()`）は options ごと渡すので Secure が付き、
    // こちらは実際に消える
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
});
