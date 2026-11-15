/**
 * ログアウト時の後始末（#931）
 *
 * ログイン中に行われた同意（owner 付き）はログアウトで端末から消す。残すと、
 * ログアウトした端末を未認証の第三者が使ったときに前の利用者の同意がそのまま
 * 適用される（`<head>` スクリプトは認証状態を同期読みできないため）。
 * 逆に、未認証時の同意（owner が空文字）は端末の匿名利用者の意思なので残す。
 *
 * `signOut` は `window.location.href` による完全遷移なので、後始末が本当に
 * 遷移前に済んでいるかは実ブラウザでしか確かめられない。
 *
 * ⚠️ `./fixtures` の `test` は使わない。専用ユーザーのコンテキストを自前で
 * 作るため、収集ビーコンの遮断も `attachGaProbe` で明示的に仕掛ける。
 */

import { test, expect, type Page } from '@playwright/test';

import { performLogin } from '../fixtures/auth';
import type { DedicatedSession } from '../fixtures/dedicatedSession';
import { cleanupUserSettings, getUserConsent } from '../helpers/api';
import { runScopedEmail } from '../helpers/runScope';

import {
  GA_COOKIE_NAMES,
  attachGaProbe,
  consentBanner,
  consentToggleRadio,
  gaCookieNames,
  grantButton,
  openGaDedicatedSession,
  readStoredConsent,
  type GaProbe,
} from './fixtures';

const USER = {
  email: runScopedEmail('e2e-consent-logout'),
  password: 'ConsentLogoutE2e1',
} as const;

test.describe('Cookie同意 / ログアウト', () => {
  test.describe.configure({ mode: 'serial', timeout: 120000 });

  let session: DedicatedSession;
  let page: Page;
  let probe: GaProbe;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    // 遮断はログインの前に張る（openGaDedicatedSession がそれを保証する）
    ({ session, probe } = await openGaDedicatedSession(browser, USER));
    page = session.page;
  });

  test.afterAll(async () => {
    await cleanupUserSettings(session.userId);
    await session.close();
  });

  test('ログイン中の同意は、ログアウトで端末から消える', async () => {
    await page.goto('/');

    await expect(consentBanner(page)).toBeVisible();
    await grantButton(page).click();
    await expect(consentBanner(page)).toBeHidden();

    // 所有者としてログインユーザーが記録される
    await expect
      .poll(async () => (await readStoredConsent(page)).owner)
      .toBe(session.userId);
    await expect
      .poll(() => gaCookieNames(page.context()))
      .toEqual(GA_COOKIE_NAMES);

    await page.getByRole('button', { name: /ユーザーメニュー/ }).click();
    await page.getByRole('menuitem', { name: 'ログアウト' }).click();
    await page.waitForURL('**/auth/signin');

    // 4キーすべてが消えている（state だけ消して付随情報が残ると、
    // 次の利用者のレコードに他人の日時が混ざる）
    expect(await readStoredConsent(page)).toEqual({
      state: null,
      at: null,
      owner: null,
      version: null,
      anonymous: null,
    });
    expect(await gaCookieNames(page.context())).toEqual([]);

    probe.expectNoBeaconEscaped();
  });

  test('ログアウト後は同意が未決定に戻り、バナーが出直す', async () => {
    await page.goto('/');
    await expect(consentBanner(page)).toBeVisible();

    probe.expectNoBeaconEscaped();
  });

  /**
   * 消すのは**端末のレコードだけ**。サーバーの記録は残す
   *
   * 端末から消すのは「この端末に前の利用者の同意を残さない」ための後始末で、
   * **利用者が同意を撤回したわけではない**。サーバーまで消すと、同じ利用者が
   * ログインし直したときに同意を訊き直すことになる。
   *
   * ⚠️ 実際に消えていた。`useConsentServerSync` の「変更の追随」に
   * ログアウト中のガードが無く、`cleanUpBeforeSignOut()` の消去が
   * `consent` を `'unset'` に変えた結果、`signOut` の完了前（まだ
   * authenticated）に `PUT { cookieConsent: 'unset' }` が 200 で通っていた。
   * PUT が Cookie 削除より後ろへずれた場合は 401 になり、ログアウト成功と
   * 同時に「設定の同期に失敗しました」のトーストが出る（同じ原因の裏表）。
   */
  test('サーバーの同意記録はログアウトでは消えない', async () => {
    expect(await getUserConsent(session.userId)).toMatchObject({
      state: 'granted',
    });
  });

  test('再ログインすると同意が復元され、バナーは出ない', async () => {
    await performLogin(page, USER);
    await page.goto('/');

    // バナーはサーバー同期が終わるまで抑止される（#1137）。出るとすれば
    // 抑止が解けた後なので、`toBeHidden` を待つだけでは不十分。
    // 同意が復元されたことを端末側でも確かめる
    await expect
      .poll(async () => (await readStoredConsent(page)).state)
      .toBe('granted');
    await expect(consentBanner(page)).toBeHidden();

    probe.expectNoBeaconEscaped();
  });

  /**
   * 撤回はログアウトでも残す（#1216）
   *
   * 消す目的は「前の利用者の**同意**を引き継がせない」こと。撤回は計測を
   * 止める方向なので、残っても次の利用者に不利益が無い。
   *
   * ⚠️ 消すと実害がある。撤回の PUT が失敗した直後にログアウトすると、
   * 端末にしか無かった決定が失われ、サーバーは `granted` のまま残る。
   * 「次のページロードのマージで送り直す」という復旧経路も一緒に消えるので、
   * 再ログインすると `granted` が降りてきて**撤回したのに計測が戻る**。
   *
   * ⚠️ この時点でログイン済みであることが前提（直前のテストが再ログインして
   * いる）。serial なので順序を入れ替えないこと
   */
  test('ログイン中の撤回は、ログアウトしても端末に残る', async () => {
    // 同意済みなのでバナーは出ない。撤回トグルから操作する
    await page.goto('/privacy');
    await consentToggleRadio(page, '同意しない').scrollIntoViewIfNeeded();
    await consentToggleRadio(page, '同意しない').click();

    await expect
      .poll(async () => (await readStoredConsent(page)).state)
      .toBe('denied');

    await page.getByRole('button', { name: /ユーザーメニュー/ }).click();
    await page.getByRole('menuitem', { name: 'ログアウト' }).click();
    await page.waitForURL('**/auth/signin');

    expect((await readStoredConsent(page)).state).toBe('denied');

    // 残っているのでバナーも出ない（未決定ではない）
    await page.goto('/');
    await expect(consentBanner(page)).toBeHidden();

    probe.expectNoBeaconEscaped();
  });
});

test.describe('Cookie同意 / 未認証でした同意の扱い', () => {
  test('未認証の同意（owner が空）は、読み込み直しても消えない', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const probe = await attachGaProbe(context);
    const page = await context.newPage();

    try {
      await page.goto('/');
      await grantButton(page).click();
      await expect(consentBanner(page)).toBeHidden();

      expect((await readStoredConsent(page)).owner).toBe('');

      // 未認証のページ読み込みでも後始末（clearOwnedConsent）は毎回走る。
      // owner が空なら対象外なので、ここで消えてはいけない
      await page.reload();

      await expect(consentBanner(page)).toBeHidden();
      expect((await readStoredConsent(page)).state).toBe('granted');
      await expect.poll(() => gaCookieNames(context)).toEqual(GA_COOKIE_NAMES);

      probe.expectNoBeaconEscaped();
    } finally {
      await context.close();
    }
  });

  /**
   * ログインを挟んでも消えない（#1213）
   *
   * ⚠️ **ここが「一度もログインしていない端末でしか成り立っていなかった」
   * ところ。** `clearOwnedConsent()` が `owner` で「ログイン中に意思表示したか」を
   * 判断していたが、`owner` は初回マージでユーザーIDへ付け替わる（claim-owner）。
   * そのため匿名でした同意が「ログイン中の同意」に化け、消えていた。
   *
   * 由来は別キー（`anonymous`）で持つようにした。`owner` は従来どおり
   * 付け替わる（`isForeign` が他人のレコードを捨てる判定に使うため）ので、
   * **`owner` が ME になっていること自体は正しい**。見るのは由来の印のほう。
   *
   * ⚠️ **ログアウト直後だけ見ても足りない。** サーバーが同じ値を返す
   * **次のページ読み込み**で印を落とすと翌ロードで元に戻るので、
   * ログイン後に1回読み直してからログアウトする
   */
  test('未認証でした同意は、ログインを挟んでもログアウトで消えない', async ({
    browser,
  }, testInfo) => {
    // ユーザー作成（bcrypt）と初回アクセスのコンパイル待ちを含むため、
    // 既定の60秒では足りないことがある（`dedicatedSession.ts` の指示）
    testInfo.setTimeout(120000);

    const user = {
      email: runScopedEmail('e2e-consent-anon-keep'),
      password: 'ConsentAnonE2e1',
    } as const;

    // ログインの前に匿名で同意しておく
    const { session, probe } = await openGaDedicatedSession(
      browser,
      user,
      async (context) => {
        const page = await context.newPage();
        await page.goto('/');
        await grantButton(page).click();
        await expect(consentBanner(page)).toBeHidden();

        const anonymousRecord = await readStoredConsent(page);
        expect(anonymousRecord.owner).toBe('');
        expect(anonymousRecord.anonymous).toBe('1');

        await page.close();
      },
    );

    try {
      const page = session.page;

      await page.goto('/');
      // 印を落とすとしたらここ（サーバーが同じ値を返す読み直し）
      await page.reload();

      // マージの着地を待つ。待たずに読むと「まだ付け替わっていないだけ」の
      // 状態を見てしまい、付け替えが復活しても気づけない
      await expect
        .poll(async () => (await readStoredConsent(page)).owner)
        .toBe(session.userId);
      // `owner` が付くのは正しい。由来の印が残っていることが要件
      expect((await readStoredConsent(page)).anonymous).toBe('1');

      await page.getByRole('button', { name: /ユーザーメニュー/ }).click();
      await page.getByRole('menuitem', { name: 'ログアウト' }).click();
      await page.waitForURL('**/auth/signin');

      // 匿名由来なので残る
      expect((await readStoredConsent(page)).state).toBe('granted');

      await page.goto('/');
      await expect(consentBanner(page)).toBeHidden();

      probe.expectNoBeaconEscaped();
    } finally {
      await cleanupUserSettings(session.userId);
      await session.close();
    }
  });
});
