/**
 * @jest-environment node
 */

/**
 * 映画同期 Cron API テスト
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

const mockSyncEigaMovies = jest.fn();
jest.mock('@/lib/eiga/syncEigaMovies', () => ({
  syncEigaMovies: () => mockSyncEigaMovies(),
}));

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/cron/sync-movies', { headers });
};

// --- Tests ---

describe('GET /api/cron/sync-movies', () => {
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
    mockSyncEigaMovies.mockResolvedValue({ synced: 5 });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ synced: 5 });
  });

  it('認証なしで401を返す', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('不正な認証トークンで401を返す', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
  });

  it('同期エラーで500を返す', async () => {
    mockSyncEigaMovies.mockRejectedValue(new Error('Sync failed'));

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'sync-movies' }),
    );
    const json = await response.json();
    expect(json.success).toBe(false);
  });
});
