/**
 * 配信（streaming）一覧のレイテンシ E2Eテスト
 *
 * 背景: 以前は streaming のキャッシュ失効時に、リクエストを受けたサーバーが
 * TMDb Discover を最大5ページ直列実行していたため、失効直後のユーザーが
 * 数十秒待たされていた（Issue #581）。事前同期CRON化により、リクエスト起点の
 * 同期は「レコード0件」のフォールバック時のみとなり、通常は DB 取得だけで返る。
 *
 * このテストは「キャッシュ鮮度に関わらず一覧が即座に返る」ことを保証する
 * リグレッションガード。旧実装ではキャッシュ失効時に必ずタイムアウトしていた。
 */

import { test, expect } from '@playwright/test';

/** 一覧APIが返るまでに許容する時間（ミリ秒） */
const RESPONSE_BUDGET_MS = 10000;

test.describe('配信一覧のレイテンシ', () => {
  test('streaming一覧APIがキャッシュ鮮度に関わらず即座に返る', async ({
    request,
  }) => {
    const startedAt = Date.now();

    const response = await request.get(
      '/api/movies?release_type=streaming&time_frame=now_showing&page=1',
      { timeout: RESPONSE_BUDGET_MS },
    );

    const elapsedMs = Date.now() - startedAt;

    expect(response.status()).toBe(200);
    expect(elapsedMs).toBeLessThan(RESPONSE_BUDGET_MS);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.movies)).toBe(true);
  });

  test('upcoming+streamingも即座に返る', async ({ request }) => {
    const startedAt = Date.now();

    const response = await request.get(
      '/api/movies?release_type=streaming&time_frame=upcoming&page=1',
      { timeout: RESPONSE_BUDGET_MS },
    );

    const elapsedMs = Date.now() - startedAt;

    expect(response.status()).toBe(200);
    expect(elapsedMs).toBeLessThan(RESPONSE_BUDGET_MS);
  });

  test('連続アクセスでもTMDb同期待ちが発生しない', async ({ request }) => {
    // 1回目でフォールバック同期が走った場合でも、2回目以降は DB 取得のみになる
    await request.get(
      '/api/movies?release_type=streaming&time_frame=now_showing&page=1',
      { timeout: 60000 },
    );

    const startedAt = Date.now();
    const response = await request.get(
      '/api/movies?release_type=streaming&time_frame=now_showing&page=1',
      { timeout: RESPONSE_BUDGET_MS },
    );
    const elapsedMs = Date.now() - startedAt;

    expect(response.status()).toBe(200);
    expect(elapsedMs).toBeLessThan(RESPONSE_BUDGET_MS);
  });
});
