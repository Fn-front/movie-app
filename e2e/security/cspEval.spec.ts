/**
 * `script-src` の enforce 違反を監視する E2Eテスト（#1099）
 *
 * ## なぜ E2E でしか見られないか
 *
 * `'unsafe-eval'` は **dev にだけ**付く（`cspDirectives.mjs`）。
 * dev サーバーでは違反が起きないので、**本番ビルドで実際にページを開くまで
 * 分からない**。jest でも検出できない（CSP はブラウザが適用する）。
 *
 * ## 何を守るか
 *
 * zod v4 は JIT を使えるかを `new Function("")` で試す。本番の CSP に当たって
 * throw し、zod 自身が catch して非JIT経路へ落ちるので**機能上の実害は無い**が、
 * **enforce の違反が毎ロード報告される**（`report-uri /api/csp-report`）。
 *
 * `<head>` のインラインスクリプトで `globalThis.__zod_globalConfig.jitless` を
 * 先に立てて probe ごと止めている（`src/lib/security/zodJitless.ts`）。
 * この仕掛けが外れる・チャンクより後ろへ動くと、違反が戻ってくる。
 *
 * ## ⚠️ `/auth/signin` は対象にしない
 *
 * あちらには zod とは**別の発生源**がある。Next.js 同梱の
 * `crypto-browserify` ポリフィル（`vm-browserify` を含む）を読むチャンクで、
 * 原因も対処も別件。どのモジュールが Node の `crypto` を client で import
 * しているかは未特定。0件にはならないので、ここで見ると誤検知になる。
 */

import { expect, test } from '@playwright/test';

import { collectCspViolations, readCspViolations } from '../helpers/csp';

/** zod を読むが、ポリフィル側の発生源が無いページ */
const PATHS = ['/movies/now-showing', '/search?query=matrix'] as const;

test.describe('script-src の enforce 違反', () => {
  test.describe.configure({ timeout: 90000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of PATHS) {
    test(`${path} で eval が遮断されない`, async ({ page }) => {
      await collectCspViolations(page);

      await page.goto(path);
      // ⚠️ 読み込み途中で測らない。zod のスキーマはチャンクの評価時に
      // 作られるので、待たずに読むと「まだ起きていないだけ」で緑になる
      await expect(page.locator('h1').first()).toBeAttached({ timeout: 20000 });
      await page.waitForLoadState('networkidle');

      // 1. 仕掛けが効いていること。これが false なら下の0件は意味を持たない
      const jitless = await page.evaluate(
        () =>
          (globalThis as unknown as Record<string, { jitless?: boolean }>)
            .__zod_globalConfig?.jitless ?? null,
      );
      expect(
        jitless,
        'globalThis.__zod_globalConfig.jitless が立っていない。' +
          'layout.tsx のインラインスクリプトがチャンクより後ろへ動いた可能性',
      ).toBe(true);

      // 2. enforce の違反が無いこと
      const violations = await readCspViolations(page);
      const blockedEval = violations.filter(
        (v) => v.disposition === 'enforce' && v.blockedURI === 'eval',
      );

      expect(
        blockedEval,
        `eval が CSP で遮断された。新しい依存が JIT を試している可能性がある:\n${JSON.stringify(
          blockedEval,
          null,
          2,
        )}`,
      ).toEqual([]);
    });
  }
});
