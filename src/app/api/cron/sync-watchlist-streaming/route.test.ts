/**
 * @jest-environment node
 */

/**
 * ウォッチリスト配信状況 同期Cron API テスト (GET)
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

const mockVerifyCronAuth = jest.fn();
jest.mock('@/helpers/cronAuth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

const mockSyncWatchlistStreaming = jest.fn();
jest.mock('@/lib/sync/syncWatchlistStreaming', () => ({
  syncWatchlistStreaming: (...args: unknown[]) =>
    mockSyncWatchlistStreaming(...args),
}));

// --- Helpers ---

const createRequest = () =>
  new NextRequest('http://localhost/api/cron/sync-watchlist-streaming');

const syncResult = {
  targets: 26,
  updated: 25,
  newlyAvailable: 3,
  failed: 1,
  durationMs: 1200,
  errors: [],
};

// --- Tests ---

describe('GET /api/cron/sync-watchlist-streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockSyncWatchlistStreaming.mockResolvedValue(syncResult);
  });

  it('同期結果を返す', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.targets).toBe(26);
    expect(body.data.newlyAvailable).toBe(3);
  });

  it('認証に失敗したらそのレスポンスを返す', async () => {
    mockVerifyCronAuth.mockReturnValue(
      new Response(JSON.stringify({ success: false }), { status: 401 }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mockSyncWatchlistStreaming).not.toHaveBeenCalled();
  });

  it('同期が失敗したら500を返す', async () => {
    mockSyncWatchlistStreaming.mockRejectedValue(new Error('boom'));

    const response = await GET(createRequest());

    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-watchlist-streaming' }),
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
      mockSyncWatchlistStreaming.mockResolvedValue({
        targets: 10,
        failed: 10,
        errors: ['boom'],
      });

      const response = await GET(createRequest());

      // ⚠️ ステータスは 200 のまま。部分的には成功しうる処理なので、
      //    500 にすると Vercel の再試行とも噛み合わない
      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'sync-watchlist-streaming' }),
      );
    });

    // ⚠️ 作品側の事情で数件落ちるのは日常。ここで鳴ると無視されるようになる
    it('数件の失敗では通知しない', async () => {
      mockSyncWatchlistStreaming.mockResolvedValue({
        targets: 100,
        failed: 3,
        errors: ['boom'],
      });

      const response = await GET(createRequest());

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });
  });
});
