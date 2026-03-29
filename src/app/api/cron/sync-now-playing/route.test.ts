/**
 * @jest-environment node
 */

/**
 * Now Playing同期 Cron API テスト
 */

import { NextRequest } from 'next/server';

import { GET, maxDuration, dynamic } from './route';

// --- Mocks ---

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

  it('maxDurationが60に設定されている', () => {
    expect(maxDuration).toBe(60);
  });

  it('dynamicがforce-dynamicに設定されている', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('正しい認証で同期が実行される', async () => {
    mockSyncNowPlaying.mockResolvedValue({ synced: 10 });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ synced: 10 });
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
  });
});
