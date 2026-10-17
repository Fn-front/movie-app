/**
 * @jest-environment node
 */

/**
 * 配信作品同期 Cron API テスト
 */

import { NextRequest } from 'next/server';

import { GET, maxDuration, dynamic } from './route';

// --- Mocks ---

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
    expect(mockSyncStreaming).not.toHaveBeenCalled();
  });

  it('同期エラーで500を返す', async () => {
    mockSyncStreaming.mockRejectedValue(new Error('Sync failed'));

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
