/**
 * @jest-environment node
 */

/**
 * 配信作品同期 Cron API テスト
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

const mockSyncStreaming = jest.fn();
jest.mock('@/lib/sync/syncStreamingMovies', () => ({
  syncStreamingMovies: () => mockSyncStreaming(),
}));

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/cron/sync-streaming', {
    headers,
  });
};

// --- Tests ---

describe('GET /api/cron/sync-streaming', () => {
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

  it('正しい認証で同期が実行され、メトリクスが返る', async () => {
    mockSyncStreaming.mockResolvedValue({
      fetched: 100,
      upserted: 80,
      skipped: 20,
      tmdbRequests: 10,
      durationMs: 1234,
      errors: [],
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.upserted).toBe(80);
    expect(json.data.tmdbRequests).toBe(10);
    expect(json.data.durationMs).toBe(1234);
  });

  it('認証なしで401を返し、同期を実行しない', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mockSyncStreaming).not.toHaveBeenCalled();
  });

  it('不正な認証トークンで401を返す', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
    expect(mockSyncStreaming).not.toHaveBeenCalled();
  });

  it('CRON_SECRET未設定で401を返す', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(401);

    // ⚠️ verifyCronAuth へ渡す CRON 名がずれると、連投抑止のカウンタを
    //   別の CRON と共有して相手の通知まで止める（#979）
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-streaming' }),
    );
    expect(mockSyncStreaming).not.toHaveBeenCalled();
  });

  it('同期エラーで500を返す', async () => {
    mockSyncStreaming.mockRejectedValue(new Error('Sync failed'));

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-streaming' }),
    );
    expect(json.success).toBe(false);
  });
  /**
   * ⚠️ **ほぼ全滅でも 200 / `success: true`**（#1354）。
   *
   * 作品単位に catch して続ける設計なので、ステータスコードでは区別が
   * つかない。レスポンスは変えず、人に届くかどうかだけを変えている。
   */
  describe('ほぼ全滅したときの通知（#1354）', () => {
    it('全件失敗したら通知する', async () => {
      mockSyncStreaming.mockResolvedValue({
        fetched: 10,
        errors: ['boom'],
        items: { attempted: 10, failed: 10 },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      // ⚠️ ステータスは 200 のまま。部分的には成功しうる処理なので、
      //    500 にすると Vercel の再試行とも噛み合わない
      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'sync-streaming' }),
      );
    });

    /**
     * ⚠️ **discover が全滅すると `attempted` が 0 になる**（#1354）。
     *
     * このルートだけ取得の例外を time_frame 単位で catch して続行するため、
     * 両方落ちても 200 / `success: true` / `fetched: 0` で返る。
     * 率では表現できないので errorCount で拾う。
     */
    it('1件も取得できずエラーがあれば通知する', async () => {
      mockSyncStreaming.mockResolvedValue({
        fetched: 0,
        errors: ['early page 1: TMDb 503', 'late page 1: TMDb 503'],
        items: { attempted: 0, failed: 0 },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'sync-streaming' }),
      );
    });

    // 単に対象が無い日は失敗ではない
    it('1件も取得できずエラーも無ければ通知しない', async () => {
      mockSyncStreaming.mockResolvedValue({
        fetched: 0,
        errors: [],
        items: { attempted: 0, failed: 0 },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });

    // ⚠️ 作品側の事情で数件落ちるのは日常。ここで鳴ると無視されるようになる
    it('数件の失敗では通知しない', async () => {
      mockSyncStreaming.mockResolvedValue({
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
