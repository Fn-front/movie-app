/**
 * 書き込み系APIのレート制限 E2Eテスト（認証済み）
 *
 * レート制限のカウンタが時間経過で減衰せず「累計10回で1分ロック」として
 * 機能していたため、お気に入りを11件登録しただけで429になっていた（#758）。
 * スライディングウィンドウ化と閾値の見直しが効いていることを、
 * APIを連続で叩いて確認する。
 *
 * 画面操作ではなくAPI直叩きにしている。検証したいのは「同じ枠を共有する
 * 書き込みを何回続けられるか」であって、UIの挙動ではないため。
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#806）。WRITE_WATCHLIST のカウンタは
 * user_id 単位のため、同じユーザーでウォッチリストを書き換える他の spec が
 * 並列に走ると、枠を食われたりカウンタをリセットされたりして結果が変わる。
 * 専用ユーザーを作って枠を占有する。
 */

import { test, expect, type Page } from '@playwright/test';

import { RATE_LIMIT_CONFIG } from '../../src/constants/rateLimit';
import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { cleanupWatchlistForUser } from '../helpers/api';
import { runScopedEmail } from '../helpers/runScope';

/** 専用ユーザーの作成（bcrypt）とログインを含むので既定の30秒では足りない */
test.describe.configure({ mode: 'serial', timeout: 90000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-write-rate-limit'),
  password: 'WriteRateLimitE2e1',
} as const;

/** 旧実装の上限（10）を確実に超え、かつ現在の上限には収まる件数 */
const CONSECUTIVE_WRITES = 20;

/** 現在の上限。これを超えたら 429 になること自体も確認する */
const MAX_ATTEMPTS = RATE_LIMIT_CONFIG.WRITE_WATCHLIST.maxAttempts;

/** E2E専用のTMDb映画ID。実在の映画と衝突させない */
const BASE_MOVIE_ID = 999201;

/** ウォッチリストに1件追加し、ステータスと採番されたIDを返す */
async function addToWatchlist(
  page: Page,
  index: number,
  label: string,
): Promise<{ status: number; id?: string }> {
  const response = await page.request.post('/api/watchlist', {
    data: {
      tmdb_movie_id: BASE_MOVIE_ID + index,
      title: `E2Eレート制限検証 ${label}${index}`,
    },
  });

  const body = (await response.json()) as { data?: { id?: string } };

  return { status: response.status(), id: body.data?.id };
}

test.describe('書き込み系APIのレート制限', () => {
  /** ログインを1回で済ませるため、spec 全体で1つのページを使い回す */
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない
    testInfo.setTimeout(90000);

    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await session.close();
  });

  // ウォッチリストの全件削除とカウンタのリセットを兼ねる
  test.beforeEach(async () => {
    await cleanupWatchlistForUser(session.userId);
  });

  test.afterEach(async () => {
    await cleanupWatchlistForUser(session.userId);
  });

  test(`ウォッチリストに${CONSECUTIVE_WRITES}件連続で追加しても429にならない`, async () => {
    const statuses: number[] = [];

    for (let i = 0; i < CONSECUTIVE_WRITES; i += 1) {
      const { status } = await addToWatchlist(page, i, '連続');
      statuses.push(status);
    }

    expect(statuses).toHaveLength(CONSECUTIVE_WRITES);
    // 429 だけを見ると、全部 401/500 で失敗していても通ってしまう。
    // 「実際に書き込めている」ことまで確かめる
    expect(statuses.filter((status) => status >= 400)).toEqual([]);
  });

  test('追加と削除を交互に繰り返してもロックされない', async () => {
    const statuses: number[] = [];

    // 追加・削除はリソース単位で同じカウンタを共有するため、
    // 10往復＝20回の書き込みとして数えられる
    for (let i = 0; i < CONSECUTIVE_WRITES / 2; i += 1) {
      const { status, id } = await addToWatchlist(page, i, '往復');
      statuses.push(status);

      // ID が返らないと DELETE を飛ばせず、意図した回数に届かないまま
      // 「429 が無い」が成立してしまう
      expect(id).toBeTruthy();

      const removed = await page.request.delete(`/api/watchlist/${id}`);
      statuses.push(removed.status());
    }

    expect(statuses).toHaveLength(CONSECUTIVE_WRITES);
    expect(statuses.filter((status) => status >= 400)).toEqual([]);
  });

  test('上限を超えれば429になる（制限自体は効いている）', async () => {
    const statuses: number[] = [];

    // 上限ちょうどまでは通り、その次で弾かれる。
    // これが無いと、レート制限を丸ごと無効化する退行でも上の2件は通る
    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) {
      const { status } = await addToWatchlist(page, i, '上限');
      statuses.push(status);
    }

    expect(statuses.slice(0, MAX_ATTEMPTS)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
  });
});
