/**
 * @jest-environment node
 */

/**
 * ウォッチリスト配信状況 同期Cron API テスト (GET)
 */

import { NextRequest } from 'next/server';

import { GET } from './route';

// --- Mocks ---

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
  });
});
