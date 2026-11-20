/**
 * @jest-environment node
 */

/**
 * 受賞作品同期 Cron API テスト
 */

import { NextRequest } from 'next/server';

import { GET } from './route';

// --- Mocks ---

/**
 * ⚠️ 通知をモックする（#979）。
 *
 * モックしないと `handleCronError` から **実際に Resend API を叩く**。
 * jest は next/jest 経由で `.env.local` を読むので、`RESEND_API_KEY` と
 * `CRON_ALERT_EMAIL` が入っている手元では**本物のメールが飛ぶ**。
 */
const mockNotifyCronFailure = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/cron/notifyCronFailure', () => ({
  notifyCronFailure: (...args: unknown[]) => mockNotifyCronFailure(...args),
}));

jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: jest.fn() })),
  dbConnectionErrorResponse: jest.fn(
    () => new Response(JSON.stringify({ success: false }), { status: 500 }),
  ),
}));

const mockExecuteSyncAwardMoviesCron = jest.fn();
jest.mock('@/lib/awards/syncAwardMoviesService', () => ({
  executeSyncAwardMoviesCron: (...args: unknown[]) =>
    mockExecuteSyncAwardMoviesCron(...args),
}));

// --- Helpers ---

const createRequest = (
  authHeader?: string,
  params?: Record<string, string>,
) => {
  const url = new URL('http://localhost/api/cron/sync-award-movies');
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest(url, { headers });
};

// --- Tests ---

describe('GET /api/cron/sync-award-movies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('認証なしで401を返す', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
  });

  it('不正な認証トークンで401を返す', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
  });

  it('DB接続エラーで500を返す', async () => {
    const { createServiceRoleClient } = await import('@/helpers/supabase');
    (createServiceRoleClient as jest.Mock).mockReturnValueOnce(null);

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);
    // ⚠️ 通知を消したらここが落ちる（#979）
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-award-movies' }),
    );
  });

  it('正常に同期が完了した場合200を返す', async () => {
    mockExecuteSyncAwardMoviesCron.mockResolvedValue({
      type: 'success',
      data: {
        year: 2026,
        month: 3,
        synced_awards: ['academy_awards'],
        skipped_awards: [],
        delete_failed_awards: [],
        total_upserted: 10,
      },
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.synced_awards).toEqual(['academy_awards']);
    expect(json.data.total_upserted).toBe(10);
  });

  it('スキップ結果の場合も200を返す', async () => {
    mockExecuteSyncAwardMoviesCron.mockResolvedValue({
      type: 'skipped',
      data: {
        year: 2026,
        month: 4,
        reason: '4月に該当する賞はありません',
      },
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('エラー結果の場合500を返す', async () => {
    mockExecuteSyncAwardMoviesCron.mockResolvedValue({
      type: 'error',
      error: '同期に失敗しました',
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    // ⚠️ 通知を消したらここが落ちる（#979）
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-award-movies' }),
    );
  });

  it('yearパラメータが不正な場合400を返す', async () => {
    const response = await GET(
      createRequest('Bearer test-secret', { year: 'abc' }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('yearパラメータが範囲外の場合400を返す', async () => {
    const response = await GET(
      createRequest('Bearer test-secret', { year: '1800' }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('yearパラメータ指定時はtargetYearとして渡される', async () => {
    mockExecuteSyncAwardMoviesCron.mockResolvedValue({
      type: 'success',
      data: {
        year: 2025,
        month: null,
        synced_awards: ['academy_awards'],
        skipped_awards: [],
        delete_failed_awards: [],
        total_upserted: 5,
      },
    });

    const response = await GET(
      createRequest('Bearer test-secret', { year: '2025' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockExecuteSyncAwardMoviesCron).toHaveBeenCalledWith(
      expect.anything(),
      2025,
    );
  });

  it('例外発生時は500を返す', async () => {
    mockExecuteSyncAwardMoviesCron.mockRejectedValue(
      new Error('Unexpected error'),
    );

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-award-movies' }),
    );
  });
  /**
   * ⚠️ **賞ごとに catch するので、全部取れなくても 200**（#1354）。
   */
  describe('ほぼ全滅したときの通知（#1354）', () => {
    const skipped = (reason: string) => ({
      award_name: `award-${reason}`,
      reason,
      detail: 'detail',
    });

    const resultWith = (skippedAwards: unknown[], synced: string[] = []) => ({
      type: 'success',
      data: {
        year: 2026,
        month: 3,
        synced_awards: synced,
        skipped_awards: skippedAwards,
        delete_failed_awards: [],
        total_upserted: 0,
      },
    });

    it('全部の賞が取れなかったら通知する', async () => {
      mockExecuteSyncAwardMoviesCron.mockResolvedValue(
        resultWith([skipped('error'), skipped('source_unavailable')]),
      );

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'sync-award-movies' }),
      );
    });

    /**
     * ⛔ **発表前は失敗ではない。**
     *
     * 賞の発表までは Wikipedia に記事そのものが無い／受賞セクションが
     * まだ無い、という状態が正常として続く。ここで鳴ると、発表待ちの
     * 時期に毎日通知が出て無視されるようになる。
     */
    it.each(['no_article', 'no_section'])(
      '%s しかなければ通知しない',
      async (reason) => {
        mockExecuteSyncAwardMoviesCron.mockResolvedValue(
          resultWith([skipped(reason), skipped(reason)]),
        );

        const response = await GET(createRequest('Bearer test-secret'));

        expect(response.status).toBe(200);
        expect(mockNotifyCronFailure).not.toHaveBeenCalled();
      },
    );

    it('半分が成功していれば通知しない', async () => {
      mockExecuteSyncAwardMoviesCron.mockResolvedValue(
        resultWith([skipped('error')], ['academy_awards', 'japan_academy']),
      );

      await GET(createRequest('Bearer test-secret'));

      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ 「同期対象の賞が無い」月は `data` の形が違う（`reason` だけ）。
     * 分解しようとして落ちないこと。
     */
    it('同期対象の賞が無い月は何もしない', async () => {
      mockExecuteSyncAwardMoviesCron.mockResolvedValue({
        type: 'success',
        data: { year: 2026, month: 3, reason: '3月に該当する賞はありません' },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });
  });
});
