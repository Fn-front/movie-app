/**
 * @jest-environment node
 */

/**
 * レート制限レコードの保持期間切れ削除 Cron API テスト
 *
 * SQL の削除条件そのもの（ロック中・カウント中の行を消さないこと）は実DBでしか
 * 検証できないため、`e2e/rateLimit/rateLimitsRetention.spec.ts` が担当する。
 * ここはルートの責務（認証・DB接続失敗・RPC失敗の扱い・レスポンス形）を見る。
 */

import { NextRequest } from 'next/server';

import { GET, maxDuration, dynamic } from './route';

// --- Mocks ---

const mockDeleteExpiredRateLimits = jest.fn();
jest.mock('@/lib/rateLimit/cleanupRateLimits', () => ({
  deleteExpiredRateLimits: (...args: unknown[]) =>
    mockDeleteExpiredRateLimits(...args),
}));

const mockCreateServiceRoleClient = jest.fn();
jest.mock('@/helpers/supabase', () => {
  const actual = jest.requireActual('@/helpers/supabase');
  return {
    ...actual,
    createServiceRoleClient: () => mockCreateServiceRoleClient(),
  };
});

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/cron/cleanup-rate-limits', {
    headers,
  });
};

// --- Tests ---

describe('GET /api/cron/cleanup-rate-limits', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
    mockCreateServiceRoleClient.mockReturnValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('maxDurationが60に設定されている', () => {
    expect(maxDuration).toBe(60);
  });

  it('dynamicがforce-dynamicに設定されている', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('正しい認証で削除が実行され、件数と保持期間を返す', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockDeleteExpiredRateLimits.mockResolvedValue(12);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ deleted_count: 12, retention_hours: 48 });
  });

  it('削除対象が無くても成功で返す', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockDeleteExpiredRateLimits.mockResolvedValue(0);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.deleted_count).toBe(0);
  });

  it('認証ヘッダが無いと401で、削除は実行されない', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mockDeleteExpiredRateLimits).not.toHaveBeenCalled();
  });

  it('認証トークンが違うと401で、削除は実行されない', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
    expect(mockDeleteExpiredRateLimits).not.toHaveBeenCalled();
  });

  it('service role クライアントを作れないとDB接続エラーを返す', async () => {
    mockCreateServiceRoleClient.mockReturnValue(null);

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);
    expect(mockDeleteExpiredRateLimits).not.toHaveBeenCalled();
  });

  it('削除に失敗したら500を返す（成功扱いにしない）', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDeleteExpiredRateLimits.mockRejectedValue(new Error('rpc failed'));

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    // 個人データの消去なので、失敗を握りつぶして success:true にしない
    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
