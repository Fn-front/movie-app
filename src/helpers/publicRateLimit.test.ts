/**
 * @jest-environment node
 */

/**
 * 公開APIレート制限ヘルパーのテスト
 */

import { enforcePublicRateLimit } from './publicRateLimit';

// --- Mocks ---

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockCreateServiceRoleClient = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

// --- Helpers ---

const FAKE_CLIENT = { from: jest.fn() } as never;

const LIMIT = { maxAttempts: 10, windowMinutes: 5 };

/** 既定で送信元IPが取れるリクエスト（本番の Vercel と同じ状態） */
const createRequest = (
  headers: Record<string, string> = {
    'x-vercel-forwarded-for': '203.0.113.10',
  },
) => new Request('http://localhost/api/movies', { headers });

/** 転送ヘッダが無いリクエスト（ローカル起動など） */
const createRequestWithoutIp = () => new Request('http://localhost/api/movies');

// --- Tests ---

describe('enforcePublicRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServiceRoleClient.mockReturnValue(FAKE_CLIENT);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  describe('正常系', () => {
    it('上限内なら null を返す（呼び出し元は処理を続行できる）', async () => {
      const result = await enforcePublicRateLimit({
        request: createRequest(),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(result).toBeNull();
    });

    it('渡された閾値をそのまま checkRateLimit に委譲する', async () => {
      await enforcePublicRateLimit({
        request: createRequest(),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        FAKE_CLIENT,
        expect.any(String),
        'read_api_movies',
        10,
        5,
      );
    });
  });

  describe('識別子の決定', () => {
    it('未認証は送信元IPで数える', async () => {
      await enforcePublicRateLimit({
        request: createRequest({ 'x-vercel-forwarded-for': '203.0.113.10' }),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(mockCheckRateLimit.mock.calls[0][1]).toBe('203.0.113.10');
    });

    it('認証済みはユーザーIDで数える（NAT で同一IPを共有する利用者を巻き込まない）', async () => {
      await enforcePublicRateLimit({
        request: createRequest({ 'x-vercel-forwarded-for': '203.0.113.10' }),
        action: 'read_api_movies',
        limit: LIMIT,
        userId: 'user-123',
      });

      expect(mockCheckRateLimit.mock.calls[0][1]).toBe('user-123');
    });

    it('送信元が特定できず未認証なら制限を掛けない', async () => {
      // 'unknown' を識別子にすると未認証リクエストが1つのカウンタを共有し、
      // 誰か1人の超過で未認証の利用者全員が 429 になる
      const result = await enforcePublicRateLimit({
        request: createRequestWithoutIp(),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(result).toBeNull();
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('送信元が特定できなくても認証済みならユーザー単位で数える', async () => {
      await enforcePublicRateLimit({
        request: createRequestWithoutIp(),
        action: 'read_api_movies',
        limit: LIMIT,
        userId: 'user-123',
      });

      expect(mockCheckRateLimit.mock.calls[0][1]).toBe('user-123');
    });
  });

  describe('上限超過', () => {
    beforeEach(() => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });
    });

    it('429 を返す', async () => {
      const result = await enforcePublicRateLimit({
        request: createRequest({ 'x-vercel-forwarded-for': '203.0.113.10' }),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);

      const json = await result!.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('Retry-After を付ける', async () => {
      const result = await enforcePublicRateLimit({
        request: createRequest(),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(result!.headers.get('Retry-After')).toBe('600');
    });

    it('429 を CDN にキャッシュさせない', async () => {
      // 公開ルートは通常 public な Cache-Control を返すため、
      // これが無いと1人分の429が無関係の利用者にも配られる
      const result = await enforcePublicRateLimit({
        request: createRequest(),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(result!.headers.get('Cache-Control')).toBe('no-store');
    });

    it('retryAfter が無い場合は Retry-After を付けない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false });

      const result = await enforcePublicRateLimit({
        request: createRequest(),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(result!.headers.get('Retry-After')).toBeNull();
      expect(result!.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('クライアントの受け渡し', () => {
    it('渡された supabase クライアントを使い、二重生成しない', async () => {
      const passed = { from: jest.fn() } as never;

      await enforcePublicRateLimit({
        request: createRequest(),
        action: 'read_api_movies',
        limit: LIMIT,
        supabase: passed,
      });

      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      expect(mockCheckRateLimit.mock.calls[0][0]).toBe(passed);
    });

    it('クライアントを作れない環境では制限を掛けずに通す', async () => {
      // 環境変数未設定で止めると設定ミスで全機能が落ちるため、
      // 既存の checkRateLimit と同じ fail-open に揃える
      mockCreateServiceRoleClient.mockReturnValue(null);

      const result = await enforcePublicRateLimit({
        request: createRequest(),
        action: 'read_api_movies',
        limit: LIMIT,
      });

      expect(result).toBeNull();
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
  });
});
