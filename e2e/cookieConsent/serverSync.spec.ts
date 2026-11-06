/**
 * サーバー同期（マージ規則）の往復（#931）
 *
 * `resolveConsentMerge` は純関数として単体テスト済みだが、
 * 「GET → マージ → localStorage 反映 → PUT」の往復が実際に**収束するか**は
 * そこでは確かめられない。日時の書式（クライアントは `…Z`、PostgREST は
 * `…+00:00`）や、状態が変わらない PUT で日時を更新しない仕様が絡むため、
 * 収束しないと毎ページロードで PUT が飛び続ける。
 *
 * サーバー側の状態は PUT では作れないものがある（日時と版はサーバーが決めるので
 * 「サーバーのほうが古い」を作れない）。そのため `seedUserConsent` で直接書く。
 *
 * ⚠️ `./fixtures` の `test` は使わない（理由は logoutClearsConsent.spec.ts と同じ）。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  cleanupUserSettings,
  getUserConsent,
  seedUserConsent,
} from '../helpers/api';
import { runScopedEmail } from '../helpers/runScope';

import {
  CURRENT_CONSENT_VERSION,
  GA_COOKIE_NAMES,
  attachGaProbe,
  consentBanner,
  consentToggleRadio,
  gaCookieNames,
  readStoredConsent,
  type GaProbe,
} from './fixtures';

const USER = {
  email: runScopedEmail('e2e-consent-sync'),
  password: 'ConsentSyncE2e1',
} as const;

/** 現行版の数値表現（サーバーへ直接書くときに使う） */
const CURRENT_VERSION_NUMBER = Number(CURRENT_CONSENT_VERSION);

/** 指定した分だけ過去の ISO 文字列 */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

test.describe('Cookie同意 / サーバー同期', () => {
  test.describe.configure({ mode: 'serial', timeout: 180000 });

  let session: DedicatedSession;
  let page: Page;
  let probe: GaProbe;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180000);
    session = await openDedicatedSession(browser, USER, async (context) => {
      probe = await attachGaProbe(context);
    });
    page = session.page;
  });

  test.afterAll(async () => {
    await cleanupUserSettings(session.userId);
    await session.close();
  });

  test('端末に記録が無ければ、サーバーの同意が降りてくる', async () => {
    await page.goto('/');
    // まだどちらにも記録が無いので未決定
    await expect(consentBanner(page)).toBeVisible();

    await seedUserConsent(session.userId, {
      state: 'granted',
      at: minutesAgo(60),
      version: CURRENT_VERSION_NUMBER,
    });

    // 初回マージは1ページロードにつき1回。完全な読み込み直しが要る
    await page.reload();

    await expect(consentBanner(page)).toBeHidden();

    const stored = await readStoredConsent(page);
    expect(stored.state).toBe('granted');
    // 所有者は現在のユーザーへ付け替わる
    expect(stored.owner).toBe(session.userId);
    expect(stored.version).toBe(CURRENT_CONSENT_VERSION);

    await expect
      .poll(() => gaCookieNames(page.context()))
      .toEqual(GA_COOKIE_NAMES);

    probe.expectNoBeaconEscaped();
  });

  test('端末で撤回すると、サーバーにも反映される', async () => {
    await page.goto('/privacy');
    await expect(consentToggleRadio(page, '同意する')).toBeChecked();

    const putDone = page.waitForResponse(
      (response) =>
        response.url().includes('/api/user/settings') &&
        response.request().method() === 'PUT' &&
        response.status() === 200,
    );

    await consentToggleRadio(page, '同意しない').click();
    await putDone;

    await expect
      .poll(async () => (await getUserConsent(session.userId))?.state)
      .toBe('denied');

    await expect.poll(() => gaCookieNames(page.context())).toEqual([]);

    probe.expectNoBeaconEscaped();
  });

  test('サーバーが古い同意に巻き戻っても、端末の新しい撤回が勝つ', async () => {
    // 別端末が古い日時で同意を書いた状況を作る
    await seedUserConsent(session.userId, {
      state: 'granted',
      at: minutesAgo(120),
      version: CURRENT_VERSION_NUMBER,
    });

    await page.reload();

    // 端末の撤回のほうが新しいので adopt-local。PUT でサーバーも戻る
    await expect
      .poll(async () => (await getUserConsent(session.userId))?.state)
      .toBe('denied');

    expect((await readStoredConsent(page)).state).toBe('denied');
    await expect(consentBanner(page)).toBeHidden();
    expect(await gaCookieNames(page.context())).toEqual([]);

    probe.expectNoBeaconEscaped();
  });

  test('一致したあとは、読み込み直しても PUT が飛ばない', async () => {
    const puts: string[] = [];
    const onRequest = (request: {
      url: () => string;
      method: () => string;
    }) => {
      if (
        request.url().includes('/api/user/settings') &&
        request.method() === 'PUT'
      ) {
        puts.push(request.url());
      }
    };
    page.on('request', onRequest);

    try {
      const getDone = page.waitForResponse(
        (response) =>
          response.url().includes('/api/user/settings') &&
          response.request().method() === 'GET',
      );

      await page.reload();
      await getDone;

      // PUT は GET のあとに続くので、GET 完了だけでは「飛ばない」を示せない。
      // マージ後の処理が走りきるだけの余裕を置いてから判定する
      await page.waitForTimeout(2000);

      // 非収束だと毎ロード PUT が飛ぶ（日時の書式違いで起きやすい）
      expect(puts).toEqual([]);
    } finally {
      page.off('request', onRequest);
    }

    probe.expectNoBeaconEscaped();
  });
});
