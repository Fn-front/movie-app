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

  it('maxDurationが60に設定されている', () => {
    expect(maxDuration).toBe(60);
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
});
