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

import type { DedicatedSession } from '../fixtures/dedicatedSession';
import { cleanupUserSettings } from '../helpers/api';
import { runScopedEmail } from '../helpers/runScope';

import {
  GA_COOKIE_NAMES,
  attachGaProbe,
  consentBanner,
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
    });
    expect(await gaCookieNames(page.context())).toEqual([]);

    probe.expectNoBeaconEscaped();
  });

  test('ログアウト後は同意が未決定に戻り、バナーが出直す', async () => {
    await page.goto('/');
    await expect(consentBanner(page)).toBeVisible();

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
});
