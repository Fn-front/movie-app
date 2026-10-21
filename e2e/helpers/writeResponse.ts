/**
 * 書き込みAPIレスポンスの待機ヘルパー
 *
 * 待機条件にステータスを含めない。`status() < 500` で待つと 429（レート制限）や
 * 409（重複）が「成功」として解決し、UIが変わらないまま後続の要素待ちが
 * `element(s) not found` で落ちて原因が読めなくなる。5xx は述語に一致せず
 * タイムアウトになり、これも原因を指さない。
 * 解決後に `ok()` を検証して、失敗はステータス付きで落とす（#802）。
 *
 * 認証系（`/api/auth/callback`）には使わない。レート制限は
 * `src/lib/auth/auth.ts` の `authorize` 内から throw され Auth.js の signin
 * エラーになるため、この経路に HTTP 429 は出ない。加えて `signin.spec.ts` /
 * `twoFactor.spec.ts` は認証失敗の 4xx を待つことが仕様。
 *
 * GET の待機（`status() === 200`）も対象外。偽成功しないため。
 */

import { expect, type Page, type Response } from '@playwright/test';

/**
 * 書き込みAPIの既定タイムアウト（ミリ秒）
 *
 * 並列実行では goto＋タイル待ち＋API応答が重なって既定の予算を超えることが
 * あるため、書き込み待ちは一律で延長する。
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * 書き込みAPIのレスポンスを待ち、失敗ステータスなら落とす
 *
 * @param page - Playwright Page
 * @param options.urlPart - 対象APIのURLに含まれる文字列（例: `/api/watchlist`）
 * @param options.methods - 対象のHTTPメソッド
 * @param options.label - 失敗時に出す操作名（例: `ウォッチリスト書き込み`）
 * @param options.timeout - 待機タイムアウト。既定 30 秒
 * @returns 成功したレスポンス
 */
export async function waitForWriteResponse(
  page: Page,
  options: {
    urlPart: string;
    methods: readonly string[];
    label: string;
    timeout?: number;
  },
): Promise<Response> {
  const { urlPart, methods, label, timeout = DEFAULT_TIMEOUT_MS } = options;

  const res = await page.waitForResponse(
    (r) => r.url().includes(urlPart) && methods.includes(r.request().method()),
    { timeout },
  );

  expect(
    res.ok(),
    `${label}が失敗した（${res.status()} ${res.request().method()}）`,
  ).toBe(true);

  return res;
}
