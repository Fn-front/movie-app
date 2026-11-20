/**
 * @jest-environment node
 */

/**
 * 公開予定同期 Cron API テスト（#1000）
 */

import { NextRequest } from 'next/server';

import { GET, maxDuration, dynamic } from './route';

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

const mockSyncUpcomingMovies = jest.fn();
jest.mock('@/lib/sync/syncUpcomingMovies', () => ({
  syncUpcomingMovies: () => mockSyncUpcomingMovies(),
}));

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/cron/sync-upcoming', {
    headers,
  });
};

const syncResult = (
  overrides: Partial<{
    fetched: number;
    upserted: number;
    errors: string[];
    items: { attempted: number; failed: number };
  }> = {},
) => ({
  fetched: 20,
  upserted: 20,
  skipped: 0,
  pages: 1,
  errors: [],
  items: { attempted: 20, failed: 0 },
  ...overrides,
});

// --- Tests ---

describe('GET /api/cron/sync-upcoming', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifyCronFailure.mockResolvedValue(true);
    mockSyncUpcomingMovies.mockResolvedValue(syncResult());
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * ⚠️ `sync-now-playing` と同じ値だが**構成は同じではない**。
   * あちらは上限10ページ＋作品ごとの逐次問い合わせで、こちらより重い。
   * 120秒は安全側に倒した値。
   */
  it('maxDurationが120に設定されている', () => {
    expect(maxDuration).toBe(120);
  });

  it('dynamicがforce-dynamicに設定されている', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('正しい認証で同期が実行される', async () => {
    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.upserted).toBe(20);
    expect(mockSyncUpcomingMovies).toHaveBeenCalled();
  });

  it('認証なしで401を返し、同期を実行しない', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mockSyncUpcomingMovies).not.toHaveBeenCalled();
  });

  it('不正な認証トークンで401を返す', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
    expect(mockSyncUpcomingMovies).not.toHaveBeenCalled();
  });

  it('CRON_SECRETが未設定の場合401を返す', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(401);

    // ⚠️ verifyCronAuth へ渡す CRON 名がずれると、連投抑止のカウンタを
    //   別の CRON と共有して相手の通知まで止める（#979）
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-upcoming' }),
    );
  });

  it('同期エラーで500を返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSyncUpcomingMovies.mockRejectedValue(new Error('Sync failed'));

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-upcoming' }),
    );
  });

  /**
   * ⚠️ **ほぼ全滅でも 200 / `success: true` で返る**（#1354）。
   *
   * ページ単位に catch して処理を続ける設計なので、ステータスコードでは
   * 区別がつかない。レスポンスは変えず、人に届くかどうかだけを変えている。
   */
  describe('ほぼ全滅したときの通知（#1354）', () => {
    it('全件失敗したら通知する', async () => {
      mockSyncUpcomingMovies.mockResolvedValue(
        syncResult({
          upserted: 0,
          errors: ['page 1: boom'],
          items: { attempted: 20, failed: 20 },
        }),
      );

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'sync-upcoming' }),
      );
    });

    // ⚠️ 作品側の事情で数件落ちるのは日常。ここで鳴ると無視されるようになる
    it('数件の失敗では通知しない', async () => {
      mockSyncUpcomingMovies.mockResolvedValue(
        syncResult({
          errors: ['page 1: boom'],
          items: { attempted: 100, failed: 3 },
        }),
      );

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **TMDb が1件も返さないと `attempted` が 0 になる**（#1354）。
     * 率では表現できないので errorCount で拾う。
     */
    it('1件も取得できずエラーがあれば通知する', async () => {
      mockSyncUpcomingMovies.mockResolvedValue(
        syncResult({
          fetched: 0,
          upserted: 0,
          errors: ['page 1: TMDb 503'],
          items: { attempted: 0, failed: 0 },
        }),
      );

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'sync-upcoming' }),
      );
    });

    // 公開予定が無い日は失敗ではない
    it('1件も取得できずエラーも無ければ通知しない', async () => {
      mockSyncUpcomingMovies.mockResolvedValue(
        syncResult({
          fetched: 0,
          upserted: 0,
          items: { attempted: 0, failed: 0 },
        }),
      );

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });
  });
});
