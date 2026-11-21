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
 * - 方式の選択: メールOTP を第2要素にしてログイン / 無効化 / 方式の切り替え
 *   （メールOTP の利用者はコードを手元で作れないため、設定変更には
 *    「確認コードを送信する」が要る。これが無いと二度と無効化できない）
 * - 期限切れ / 試行回数上限: 設定中にコードを送り直せる（#1285 / #1349）。
 *   再送が設定変更の枠を食わないことまで見る
 */

import { test, expect, type Page } from '@playwright/test';

import { API_ENDPOINTS } from '@/constants';
import { OTP_CONFIG } from '@/constants/otp';
import { RATE_LIMIT_ACTION } from '@/constants/rateLimit';

import { getLatestOtpCode, getRateLimitRow } from '../helpers/api';
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
  expectSetupBlockedWithoutReauth,
  isRecoveryCodeStored,
  reauthForSecondFactorSetup,
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
  await expectSetupBlockedWithoutReauth(page);
  await reauthForSecondFactorSetup(page, USER.password);
  await page.getByRole('button', { name: '認証アプリで設定する' }).click();

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

    // ⛔ #1368 の証跡。再認証の欄が出ていて、方式のボタンが押せない状態。
    //    ⚠️ ページ全体だとボタンが画面の外へ出るので、節だけを撮る
    await expectSetupBlockedWithoutReauth(page);
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '二段階認証' }) })
      .screenshot({ path: 'docs/e2e-screenshots/two-factor-reauth.png' });

    await enableTwoFactor(page);

    // 控えて有効状態へ
    await page
      .getByRole('button', { name: 'リカバリーコードを控えました' })
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

  test('所持の証明なしでは無効化できない', async ({ page }) => {
    // セッションだけで外せたら、セッションを奪った第三者が第2要素を無効化できる
    await loginAndOpenSettings(page);
    await enableTwoFactor(page);
    await page
      .getByRole('button', { name: 'リカバリーコードを控えました' })
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
      .getByRole('button', { name: 'リカバリーコードを控えました' })
      .click();

    const code = await getCurrentTotpCode(USER.email);
    await page.getByLabel('認証コード').fill(code!);
    await page.getByRole('button', { name: '二段階認証を無効にする' }).click();

    await expect(
      page.getByRole('button', { name: '認証アプリで設定する' }),
    ).toBeVisible();

    // 無効化後はパスワードだけでログインできる
    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await submitCredentials(page);

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  /**
   * 設定画面でメールOTP を方式に選んで有効化する
   *
   * @returns 画面に表示されたリカバリーコード
   */
  async function enableEmailOtp(page: Page): Promise<string[]> {
    // ⛔ 再認証（#1368）
    await reauthForSecondFactorSetup(page, USER.password);
    await page.getByRole('button', { name: 'メールで設定する' }).click();

    // コードはサーバーが送信済み。DB から取り出して入力する
    // リード文は「送りました」と断定しなくなった（#1285）。送信の結果は
    // notice 側が言う
    await expect(
      page.getByText('確認コードをメールに送信しました。'),
    ).toBeVisible();

    const code = await getLatestOtpCode(USER.email, 'two_factor');
    expect(code).not.toBeNull();

    // ⚠️ getByLabel は既定で**部分一致**する。同じ設定画面の
    // パスワード変更セクションにも『確認コード』を含むボタンがあるため、
    // ロールと exact で絞らないと strict mode 違反になる
    await page
      .getByRole('textbox', { name: '確認コード', exact: true })
      .fill(code!);
    await page.getByRole('button', { name: '二段階認証を有効にする' }).click();

    const codeList = page.getByRole('list', { name: 'リカバリーコード' });
    await expect(codeList).toBeVisible();

    return (await codeList.getByRole('listitem').allInnerTexts()).map((text) =>
      text.trim(),
    );
  }

  test('メールOTP を第2要素にしてログインできる', async ({ page }) => {
    await loginAndOpenSettings(page);
    await enableEmailOtp(page);

    await page
      .getByRole('button', { name: 'リカバリーコードを控えました' })
      .click();
    await expect(page.getByText('二段階認証は')).toBeVisible();

    await page.context().clearCookies();
    await page.goto('/auth/signin');

    // パスワードだけでは通らず、コードの入力欄が出る。
    // このときサーバーが新しいコードを送っている
    await submitCredentials(page);
    const codeField = page.getByLabel('認証コード');
    await expect(codeField).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);

    // 認証アプリとの違い。再送の導線が出る
    await expect(
      page.getByRole('button', { name: '確認コードを再送信する' }),
    ).toBeVisible();

    const loginCode = await getLatestOtpCode(USER.email, 'two_factor');
    expect(loginCode).not.toBeNull();

    await codeField.fill(loginCode!);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  /**
   * 設定中（メールOTP）の再送（#1285 / #1349）
   *
   * ⛔ これが無いと、コードの試行回数（5回）を使い切った利用者は
   * 「やめる → メールで設定する」でやり直すしかない。60秒以内だと
   * 再送間隔に当たって1通も届かないまま同じ画面に戻るため、最大60秒の
   * あいだ何をしても進めない窓ができていた。
   *
   * ⛔ **枠を消費しないことが本命**（#1347 のレビューで major になった形）。
   * 再送が `setup` を叩き直す実装だと `TOTP_SETTINGS_VERIFY`（5回/15分）を
   * 食うので、
   *
   *   setup(1) + 再送×4 = 5 → 6回目の「有効にする」が 429 で15分ロック
   *
   * となり、**直そうとしている行き止まりを別の形で作る**。単体テストは
   * 「`send-challenge` を叩く」までしか固定できない。
   *
   * ⚠️ 60秒のカウントダウンを**実時間で待つ**ため、このテストだけ長めに取る。
   *
   * ⛔ **180秒では足りなかった**（CI のシャード2で実測。`waitForResponse` が
   * テスト上限に当たって落ちた）。内訳は
   *
   *   ログイン（bcrypt）＋設定画面の到達 → 再認証 → setup
   *   → **60秒のカウントダウン** → 再送 → 有効化
   *
   * で、CI は2ワーカーの共有ランナーなので前半だけで100秒を超えることが
   * ある。カウントダウンの75秒を足すと上限に届く。
   *
   * ⚠️ カウントダウンはクライアントの state（`useResendCountdown`）なので、
   * DB の `created_at` を戻しても縮まない。待つ以外の手は
   * `page.clock` で時計ごと進めることだが、`Date` をモックすると
   * セッションの有効期限など無関係なタイマーまで動く。**待つ時間は
   * そのままに、上限だけ上げる**。
   */
  test('設定中（メールOTP）にコードを送り直せる（#1285）', async ({ page }) => {
    test.setTimeout(300_000);

    await loginAndOpenSettings(page);

    // ⛔ 再認証（#1368）
    await reauthForSecondFactorSetup(page, USER.password);
    await page.getByRole('button', { name: 'メールで設定する' }).click();

    /**
     * ⚠️ 可視テキストで引く（本文が「送信しています…」に変わるため、
     * 固定の `aria-label` を付けると WCAG 2.5.3 Label in Name に反する）。
     *
     * ⚠️ **ただしここで引けること自体は Label in Name を守らない。**
     * `getByRole(..., { name })` が見るのは**アクセシブルネーム**で、
     * `aria-label='確認コードを再送信する'` を足してもネームは変わらず
     * このロケータは一致し続ける。違反が出るのは `isSubmitting` の最中
     * （可視テキストだけが変わる）で、そこは何もアサートしていない。
     * axe での検査は `e2e/a11y/labelInName.spec.ts` の担当（現状は TOTP
     * 経路のみ。メールOTP 経路は未カバー）。
     */
    const resendButton = page.getByRole('button', {
      name: '確認コードを再送信する',
    });

    /**
     * ⚠️ ページ全体ではなく節だけを撮る（`二段階認証の再認証` の撮影と同じ）。
     * notice（「確認コードをメールに送信しました。」）は節の**最上部**に
     * 出るのに、再送ボタンは下のほうにある。ビューポートで撮ると
     * 送信前後で**1ピクセルも変わらない同じ画像**になる。
     */
    const section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '二段階認証' }) });

    // 1. 送った直後は押せない（サーバー側の再送間隔に当たるだけなので手前で止める）
    await expect(resendButton).toBeDisabled();
    await section.screenshot({
      path: 'docs/e2e-screenshots/two-factor-setup-resend-cooldown.png',
    });

    const firstCode = await getLatestOtpCode(USER.email, 'two_factor');
    expect(firstCode).not.toBeNull();

    // 再送の前の消費量。`setup` のぶんで1回入っている（`setup/route.ts` は
    // 方式によらず検証より前に1回消費する）。
    // ⚠️ 行そのものが無い退行と区別できるよう、先に存在を見る
    const beforeResend = await getRateLimitRow(
      userId,
      RATE_LIMIT_ACTION.TOTP_SETTINGS_VERIFY,
    );
    expect(beforeResend).not.toBeNull();
    expect(beforeResend?.attempts).toBe(1);

    // 2. カウントダウンが明けるのを待つ（60秒）
    await expect(resendButton).toBeEnabled({
      timeout: (OTP_CONFIG.RESEND_INTERVAL_SECONDS + 30) * 1000,
    });

    /**
     * ⚠️ **境界に1秒の余裕を取る。**
     *
     * 画面のカウントダウンはクライアントの state、サーバーの判定は
     * `otp_codes.created_at` からの経過秒。基準が別なので、押せるように
     * なった直後は**サーバー側がまだ60秒に届いていない**ことがある。
     * そうなると再送が `THROTTLED` で返り、下の待ちが**応答を取り違える**
     * （CI のシャード2で実測）。
     */
    await page.waitForTimeout(1000);
    await section.screenshot({
      path: 'docs/e2e-screenshots/two-factor-setup-resend-ready.png',
    });

    // 3. 再送すると新しいコードが入る（古いコードは消える）
    //
    // ⚠️ 文言の出現で待たない。同じ `CODE_SENT` は `startSetup` が既に
    //    出していて、60秒待つあいだ画面に残っている。「同じ文字が見える」
    //    ことは再送の成功を意味しないので、**応答そのもの**を待つ
    //
    // ⚠️ **`response.ok()` を条件に入れない**（CI のシャード2で実測）。
    //    再送が 429 / 400 で返ると述語が永久に一致せず、
    //    `page.waitForResponse` がテスト上限まで**ハングする**。
    //    失敗の第一報が「タイムアウト」になって原因が分からない。
    //    応答そのものを待ってから、別に ok を主張する
    const resent = page.waitForResponse((response) =>
      response.url().includes(API_ENDPOINTS.USER_TOTP_SEND_CHALLENGE),
    );
    await resendButton.click();
    const resentResponse = await resent;

    // 落ちたときに「何が返ったか」を出す
    expect(
      resentResponse.ok(),
      `再送が ${resentResponse.status()} を返した: ${await resentResponse.text()}`,
    ).toBe(true);

    await expect(
      page.getByText('確認コードをメールに送信しました。'),
    ).toBeVisible();

    // ⚠️ ここでスクリーンショットを撮らない。notice は `startSetup` が既に
    //    同じ文言で出していて、再送の前後で**見た目が変わらない**。
    //    撮っても `-cooldown.png` とバイト同一の画像が増えるだけ

    const resentCode = await getLatestOtpCode(USER.email, 'two_factor');
    expect(resentCode).not.toBeNull();
    expect(resentCode).not.toBe(firstCode);

    // 5. 再送は設定変更の枠を消費しない（`send-challenge` 経由であること）
    //
    // ⚠️ **「有効にする」より前に読む。** `enable` も同じカウンタを消費し、
    //    成功すると `resetRateLimit` で行ごと消す。後ろに置くと観測できない
    const afterResend = await getRateLimitRow(
      userId,
      RATE_LIMIT_ACTION.TOTP_SETTINGS_VERIFY,
    );
    expect(afterResend?.attempts).toBe(1);

    // 4. 送り直したコードで有効化まで到達できる
    await page
      .getByRole('textbox', { name: '確認コード', exact: true })
      .fill(resentCode!);
    await page.getByRole('button', { name: '二段階認証を有効にする' }).click();

    await expect(
      page.getByRole('list', { name: 'リカバリーコード' }),
    ).toBeVisible();
    await section.screenshot({
      path: 'docs/e2e-screenshots/two-factor-setup-resend-enabled.png',
    });
  });

  /**
   * ⚠️ メールOTP の利用者は手元でコードを作れない。
   * 「確認コードを送信する」が無いと、一度有効にしたら二度と無効化できない。
   */
  test('メールOTP でも無効化できる（コードを送って本人確認する）', async ({
    page,
  }) => {
    await loginAndOpenSettings(page);
    await enableEmailOtp(page);
    await page
      .getByRole('button', { name: 'リカバリーコードを控えました' })
      .click();

    // 有効化で使ったコードは消費済み。送信ボタンで新しいコードを受け取る
    await page
      .getByRole('button', { name: '二段階認証の確認コードを送信' })
      .click();

    // ⚠️ クリックは即座に返る。送信完了を待たずにDBを読むと
    // まだ行が無く、コードが取れない
    await expect(
      page.getByText('確認コードをメールに送信しました。'),
    ).toBeVisible();

    const code = await getLatestOtpCode(USER.email, 'two_factor');
    expect(code).not.toBeNull();

    await page.getByLabel('認証コード').fill(code!);
    await page.getByRole('button', { name: '二段階認証を無効にする' }).click();

    // 無効に戻ると方式の選択肢が出る
    await expect(
      page.getByRole('button', { name: '認証アプリで設定する' }),
    ).toBeVisible();
  });

  test('方式を切り替えられる（メールOTP → 認証アプリ）', async ({ page }) => {
    await loginAndOpenSettings(page);
    await enableEmailOtp(page);
    await page
      .getByRole('button', { name: 'リカバリーコードを控えました' })
      .click();

    // いったん無効化する
    await page
      .getByRole('button', { name: '二段階認証の確認コードを送信' })
      .click();

    // ⚠️ クリックは即座に返る。送信完了を待たずにDBを読むと
    // まだ行が無く、コードが取れない
    await expect(
      page.getByText('確認コードをメールに送信しました。'),
    ).toBeVisible();
    const code = await getLatestOtpCode(USER.email, 'two_factor');
    await page.getByLabel('認証コード').fill(code!);
    await page.getByRole('button', { name: '二段階認証を無効にする' }).click();

    // 認証アプリで設定し直す
    await enableTwoFactor(page);
    await page
      .getByRole('button', { name: 'リカバリーコードを控えました' })
      .click();

    // 認証アプリ方式では送信ボタンが出ない
    await expect(page.getByText('二段階認証は')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '二段階認証の確認コードを送信' }),
    ).toBeHidden();
  });

  test('メールOTP でもリカバリーコードでログインできる', async ({ page }) => {
    await loginAndOpenSettings(page);
    const recoveryCodes = await enableEmailOtp(page);

    expect(recoveryCodes.length).toBeGreaterThan(0);
    expect(await isRecoveryCodeStored(USER.email, recoveryCodes[0])).toBe(true);

    await page.context().clearCookies();
    await page.goto('/auth/signin');
    await submitCredentials(page);

    // メールを待たずにリカバリーコードで入れる
    await page.getByLabel('認証コード').fill(recoveryCodes[0]);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    await page.waitForURL('/');
    expect(await isRecoveryCodeStored(USER.email, recoveryCodes[0])).toBe(
      false,
    );
  });
});
