/**
 * @jest-environment node
 */

/**
 * 受賞作品同期 Cron API テスト
 */

import { NextRequest } from 'next/server';

import { GET } from './route';

// --- Mocks ---

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

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest(
    'http://localhost/api/cron/sync-award-movies',
    { headers },
  );
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
  });

  it('正常に同期が完了した場合200を返す', async () => {
    mockExecuteSyncAwardMoviesCron.mockResolvedValue({
      type: 'success',
      data: {
        year: 2026,
        month: 3,
        synced_awards: ['academy_awards'],
        skipped_awards: [],
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
  });

  it('例外発生時は500を返す', async () => {
    mockExecuteSyncAwardMoviesCron.mockRejectedValue(
      new Error('Unexpected error'),
    );

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);
  });
});
