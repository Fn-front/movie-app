/**
 * @jest-environment node
 */

/**
 * 映画キャッシュ バッチ更新 Cron API テスト
 */

import { NextRequest } from 'next/server';

import { MOVIES_SUCCESS_MESSAGES } from '@/constants';

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

const mockUpdateMoviesCacheByBatch = jest.fn();
jest.mock('@/lib/sync/updateMoviesCacheByBatch', () => ({
  updateMoviesCacheByBatch: () => mockUpdateMoviesCacheByBatch(),
}));

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/cron/update-movies', {
    headers,
  });
};

// --- Tests ---

describe('GET /api/cron/update-movies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maxDurationが300に設定されている', () => {
    expect(maxDuration).toBe(300);
  });

  it('dynamicがforce-dynamicに設定されている', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('正しい認証でバッチ更新が実行される', async () => {
    mockUpdateMoviesCacheByBatch.mockResolvedValue({
      total: 100,
      updated: 95,
      errors: [],
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe(MOVIES_SUCCESS_MESSAGES.CACHE_UPDATED);
    expect(json.updated_count).toBe(95);
    expect(json.data).toEqual({ total: 100, updated: 95, errors: [] });
  });

  it('認証なしで401を返す', async () => {
    const response = await GET(createRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('不正な認証トークンで401を返す', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
  });

  it('バッチ更新エラーで500を返す', async () => {
    mockUpdateMoviesCacheByBatch.mockRejectedValue(
      new Error('Batch update failed'),
    );

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'update-movies' }),
    );
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
  });

  it('部分的なエラーがある場合も200で結果を返す', async () => {
    mockUpdateMoviesCacheByBatch.mockResolvedValue({
      total: 50,
      updated: 48,
      errors: ['ID 123: Request failed', 'ID 456: Timeout'],
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.updated_count).toBe(48);
    expect(json.data.errors).toHaveLength(2);
  });
  /**
   * ⚠️ **ほぼ全滅でも 200 / `success: true`**（#1354）。
   *
   * 作品単位に catch して続ける設計なので、ステータスコードでは区別が
   * つかない。レスポンスは変えず、人に届くかどうかだけを変えている。
   */
  describe('ほぼ全滅したときの通知（#1354）', () => {
    it('全件失敗したら通知する', async () => {
      mockUpdateMoviesCacheByBatch.mockResolvedValue({
        total: 10,
        updated: 0,
        errors: ['boom'],
        items: { attempted: 10, failed: 10 },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      // ⚠️ ステータスは 200 のまま。部分的には成功しうる処理なので、
      //    500 にすると Vercel の再試行とも噛み合わない
      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'update-movies' }),
      );
    });

    // ⚠️ 作品側の事情で数件落ちるのは日常。ここで鳴ると無視されるようになる
    it('数件の失敗では通知しない', async () => {
      mockUpdateMoviesCacheByBatch.mockResolvedValue({
        total: 10,
        updated: 0,
        errors: ['boom'],
        items: { attempted: 100, failed: 3 },
      });

      const response = await GET(createRequest('Bearer test-secret'));

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });
  });
});
