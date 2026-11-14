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
 * この仕掛けが外れる・zod のチャンクより後ろへ回ると、違反が戻ってくる。
 *
 * ## ⚠️ 違反の発生源を**チャンクの中身で**見分ける
 *
 * `eval` の違反は zod だけではない。Next.js 同梱の `crypto-browserify`
 * ポリフィル（`vm-browserify` を含む）を読むページでも出る。これは原因も対処も
 * 別件（追跡は別Issue）なので、件数だけを見ると
 *
 * - ポリフィルを読むページを検査対象にできない
 * - その中に zod の分が混ざっても気づけない
 *
 * の両方が起きる。`sourceFile` のチャンクを実際に取得して、
 * **`jitless` という文字列を含むか**で zod 由来を判定する。
 *
 * ## ポリフィル側も塞いだ（#1104）
 *
 * 発生源は `src/lib/auth/accountIdentity.ts` の `import { randomInt } from 'crypto'`
 * だった。同じファイルに `isEmailIdentifier` / `isUsernameShape` が同居しており、
 * `@/schema/auth` 経由でログイン・新規登録・パスワード変更のフォームへ
 * 引き込まれていた。生成側を `accountIdentityGenerator.ts` へ分けて解消した。
 *
 * 下の `eval の違反が1件も無い` は、**zod に限らず** `blockedURI === 'eval'` を
 * 全部見る。発生源の判定を挟まないぶん、新しい経路でポリフィルが戻ってきても
 * そのまま落ちる。
 */

import { expect, test, type Page } from '@playwright/test';

import {
  collectCspViolations,
  readCspViolations,
  type CspViolation,
} from '../helpers/csp';

/**
 * 検査するページ
 *
 * ⚠️ **ドキュメント順で zod のチャンクがインラインより前に出るページを含める。**
 * 先に走る根拠は配置ではなく async スクリプトの性質なので、順序がいちばん
 * 際どいページで確かめる意味がある（実測: `/auth/signup` は
 * zod チャンク 1744 / インライン 2232）。
 */
const PATHS = [
  '/movies/now-showing',
  '/search?query=matrix',
  '/auth/signup',
] as const;

/** チャンクの中身を見て zod 由来かを判定する */
async function isFromZodChunk(
  page: Page,
  violation: CspViolation,
): Promise<boolean> {
  if (!violation.sourceFile.includes('/_next/static/chunks/')) return false;

  try {
    const body = await page.evaluate(
      (url) => fetch(url).then((res) => res.text()),
      violation.sourceFile,
    );
    // zod の JIT 判定は `globalConfig.jitless` を読む。ポリフィル側のチャンクは
    // `runInThisContext`（vm-browserify）を持ち、`jitless` は持たない
    return body.includes('jitless');
  } catch {
    return false;
  }
}

test.describe('script-src の enforce 違反', () => {
  test.describe.configure({ timeout: 90000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of PATHS) {
    test(`${path} で zod が eval を試さない`, async ({ page }) => {
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
          'layout.tsx のインラインスクリプトが消えたか壊れている',
      ).toBe(true);

      // 2. zod 由来の enforce 違反が無いこと
      const violations = await readCspViolations(page);
      const blockedEval = violations.filter(
        (v) => v.disposition === 'enforce' && v.blockedURI === 'eval',
      );

      const fromZod: CspViolation[] = [];
      for (const violation of blockedEval) {
        if (await isFromZodChunk(page, violation)) fromZod.push(violation);
      }

      expect(
        fromZod,
        'zod のチャンクから eval が遮断された。インラインスクリプトが' +
          `zod のチャンクより後ろへ回った可能性がある:\n${JSON.stringify(
            fromZod,
            null,
            2,
          )}`,
      ).toEqual([]);
    });
  }
});

/**
 * ポリフィル経路も含めて `eval` の違反を0件に保つ（#1104）
 *
 * 上の describe は**zod 由来だけ**を見ている。`crypto-browserify` ポリフィルの
 * 分は当時まだ残っていたため、件数で見ると必ず落ちたからで、発生源を
 * チャンクの中身で選り分ける作りになっている。
 *
 * #1104 でポリフィルを引き込んでいた import（`accountIdentity.ts` の
 * `randomInt`）を切り離したので、**選り分けずに0件**を要求できるようになった。
 * 新しい経路で `crypto` / `stream` / `buffer` がクライアントへ混ざっても、
 * 発生源の判定を足さずにそのまま落ちる。
 *
 * ⚠️ **dev では再現しない。** dev の CSP には `'unsafe-eval'` が付く
 * （`cspDirectives.mjs`）。必ず `npm run build && npm start` で確かめること。
 */
test.describe('eval の違反が1件も無い（発生源を問わない）', () => {
  test.describe.configure({ timeout: 90000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * ポリフィルを読んでいたページ
   *
   * どれも `@/schema/auth` の zod スキーマを使うフォームを持つ。
   * 実測（修正前の本番ビルド）では3ページとも
   * `enforce / eval / /_next/static/chunks/3dwdxndg__wbt.js` が1件ずつ出ていた。
   */
  const POLYFILL_PATHS = [
    '/auth/signup',
    '/auth/signin',
    '/auth/forgot-password',
  ] as const;

  for (const path of POLYFILL_PATHS) {
    test(`${path} で eval が遮断されない`, async ({ page }) => {
      await collectCspViolations(page);

      await page.goto(path);
      // ⚠️ 読み込み途中で測らない。ポリフィルの `Function(...)` は
      // チャンクの評価時に走るので、待たずに読むと「まだ起きていないだけ」で緑になる
      await expect(page.locator('h1').first()).toBeAttached({ timeout: 20000 });
      await page.waitForLoadState('networkidle');

      const blockedEval = (await readCspViolations(page)).filter(
        (v) => v.blockedURI === 'eval',
      );

      expect(
        blockedEval.map((v) => `${v.disposition} ${v.sourceFile}`),
        'eval が遮断された。クライアントへ Node の crypto / stream / buffer を' +
          '読むモジュールが混ざり、crypto-browserify ポリフィルが同梱された' +
          '可能性がある（#1104）',
      ).toEqual([]);
    });
  }
});
