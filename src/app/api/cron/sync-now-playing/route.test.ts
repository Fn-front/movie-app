/**
 * @jest-environment node
 */

/**
 * Now Playing同期 Cron API テスト
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

const mockSyncNowPlaying = jest.fn();
jest.mock('@/lib/sync/syncNowPlayingMovies', () => ({
  syncNowPlayingMovies: () => mockSyncNowPlaying(),
}));

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/cron/sync-now-playing', {
    headers,
  });
};

// --- Tests ---

describe('GET /api/cron/sync-now-playing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maxDurationが120に設定されている', () => {
    expect(maxDuration).toBe(120);
  });

  it('dynamicがforce-dynamicに設定されている', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('正しい認証で同期が実行される', async () => {
    mockSyncNowPlaying.mockResolvedValue({
      synced: 10,
      errors: [],
      items: { attempted: 10, failed: 0 },
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      synced: 10,
      errors: [],
      items: { attempted: 10, failed: 0 },
    });
  });

  it('認証なしで401を返す', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
  });

  it('不正な認証トークンで401を返す', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
  });

  it('同期エラーで500を返す', async () => {
    mockSyncNowPlaying.mockRejectedValue(new Error('Sync failed'));

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-now-playing' }),
    );
  });
  /**
   * ⚠️ **ほぼ全滅でも 200 / `success: true`**（#1354）。
   *
   * 作品単位に catch して続ける設計なので、ステータスコードでは区別が
   * つかない。レスポンスは変えず、人に届くかどうかだけを変えている。
   */
  describe('ほぼ全滅したときの通知（#1354）', () => {
    it('全件失敗したら通知する', async () => {
      mockSyncNowPlaying.mockResolvedValue({
        fetched: 10,
        errors: ['boom'],
        items: { attempted: 10, failed: 10 },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      // ⚠️ ステータスは 200 のまま。部分的には成功しうる処理なので、
      //    500 にすると Vercel の再試行とも噛み合わない
      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'sync-now-playing' }),
      );
    });

    // ⚠️ 作品側の事情で数件落ちるのは日常。ここで鳴ると無視されるようになる
    it('数件の失敗では通知しない', async () => {
      mockSyncNowPlaying.mockResolvedValue({
        fetched: 10,
        errors: ['boom'],
        items: { attempted: 100, failed: 3 },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });
  });
});
