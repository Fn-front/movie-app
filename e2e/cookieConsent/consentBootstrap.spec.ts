/**
 * `<head>` のブートストラップ（#931）
 *
 * `src/app/layout.tsx` が `<head>` へ埋める
 * `buildConsentBootstrapScript()` の出力が、実ブラウザで
 * `consent default` を正しく積むかを見る。
 *
 * 単体テストは文字列の組み立てしか検証できない。「gtag.js より前に積まれて
 * いるか」「localStorage の同期読みが効いて再訪問者に往復が起きないか」は
 * 実ブラウザでしか確かめられない。
 */

import {
  CURRENT_CONSENT_VERSION,
  E2E_GA_MEASUREMENT_ID,
  GA_COOKIE_NAMES,
  consentBanner,
  expect,
  gaCookieNames,
  readConsentCommands,
  seedStoredConsentAndReload,
  test,
} from './fixtures';

test.describe('Cookie同意 / <head> のブートストラップ', () => {
  test('初訪問は analytics_storage を denied で積み、Cookie も作らない', async ({
    page,
    context,
    ga,
  }) => {
    await page.goto('/');

    await expect(consentBanner(page)).toBeVisible();

    const commands = await readConsentCommands(page);
    expect(commands[0]?.action).toBe('default');
    expect(commands[0]?.params).toMatchObject({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });

    // Consent Mode advanced なので gtag.js は同意の有無によらず読み込む。
    // ここが落ちるなら NEXT_PUBLIC_GA_ID が届いていない
    await expect
      .poll(() => ga.gtagScriptResponses.map((response) => response.status))
      .toContain(200);

    // ビルドへ埋まった測定IDが、こちらの期待する値と一致していること。
    // CI では `.github/workflows/e2e.yml` の build step が渡しており、
    // ずれると `_ga_<別名>` が来て Cookie 系の spec が遠回りな落ち方をする
    expect(
      ga.gtagScriptResponses.some((response) =>
        response.url.includes(E2E_GA_MEASUREMENT_ID),
      ),
      `読み込まれた gtag.js が ${E2E_GA_MEASUREMENT_ID} ではない（ビルド時の NEXT_PUBLIC_GA_ID を確認すること）`,
    ).toBe(true);

    // denied で始まっている以上、Cookie は1つも置かれない。
    // 「少し遅れて書かれる」回帰を素通ししないよう、待ってから確認する
    await expect.poll(() => gaCookieNames(context)).toEqual([]);
  });

  test('同意済みの再訪問は denied を経ずに granted で始まる', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    await seedStoredConsentAndReload(page, {
      state: 'granted',
      at: new Date().toISOString(),
      // 未ログインで同意した端末を想定する（owner は空文字）
      owner: '',
      version: CURRENT_CONSENT_VERSION,
    });

    // 最初の consent コマンドの時点で granted。denied → update の往復が無い
    const commands = await readConsentCommands(page);
    expect(commands[0]?.action).toBe('default');
    expect(commands[0]?.params.analytics_storage).toBe('granted');

    await expect(consentBanner(page)).toBeHidden();
    await expect.poll(() => gaCookieNames(context)).toEqual(GA_COOKIE_NAMES);
  });

  test('版が古い記録は未決定として扱い、バナーを出し直す', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    await seedStoredConsentAndReload(page, {
      state: 'granted',
      at: new Date().toISOString(),
      owner: '',
      // 現行版より古い版で同意した記録
      version: String(Number(CURRENT_CONSENT_VERSION) - 1),
    });

    // <head> スクリプトは生文字列で版を比較する。一致しないので denied
    const commands = await readConsentCommands(page);
    expect(commands[0]?.params.analytics_storage).toBe('denied');

    await expect(consentBanner(page)).toBeVisible();
    await expect.poll(() => gaCookieNames(context)).toEqual([]);
  });
});
