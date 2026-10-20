/**
 * @jest-environment node
 */

/**
 * 人物詳細API Route テスト
 */

import { AxiosError } from 'axios';

import { GET } from './route';

// --- Mocks ---

const mockGetCachedPersonDetail = jest.fn();
jest.mock('@/lib/api/person/person.server', () => ({
  getCachedPersonDetail: (...args: unknown[]) =>
    mockGetCachedPersonDetail(...args),
}));

const mockGetAuthSession = jest.fn().mockResolvedValue(null);
jest.mock('@/helpers/auth', () => ({
  getAuthSession: (...args: unknown[]) => mockGetAuthSession(...args),
}));

const mockEnforcePublicRateLimit = jest.fn();
jest.mock('@/helpers/publicRateLimit', () => ({
  enforcePublicRateLimit: (...args: unknown[]) =>
    mockEnforcePublicRateLimit(...args),
}));

// --- Helpers ---

const createRequest = (id: string) =>
  new Request(`http://localhost/api/person/${id}`);

const createParams = (id: string) => Promise.resolve({ id });

const createPerson = (overrides: Record<string, unknown> = {}) => ({
  id: 500,
  name: 'テスト俳優',
  biography: '略歴',
  is_biography_fallback: false,
  birthday: '1980-05-01',
  deathday: null,
  place_of_birth: '東京',
  profile_path: '/profile.jpg',
  known_for_department: 'Acting',
  adult: false,
  cast: [],
  ...overrides,
});

const createNotFoundError = () =>
  new AxiosError('Not Found', '404', undefined, undefined, {
    status: 404,
    data: {},
    statusText: 'Not Found',
    headers: {},
    config: { headers: {} },
  } as never);

// --- Tests ---

describe('GET /api/person/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue(null);
    // 既定は上限内（null を返すと通過）
    mockEnforcePublicRateLimit.mockResolvedValue(null);
  });

  it('正常に人物詳細を返す', async () => {
    const person = createPerson();
    mockGetCachedPersonDetail.mockResolvedValue(person);

    const response = await GET(createRequest('500'), {
      params: createParams('500'),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(person);
    expect(mockGetCachedPersonDetail).toHaveBeenCalledWith(500);
  });

  describe('IDバリデーション', () => {
    it.each([
      ['非数値', 'abc'],
      ['負数', '-1'],
      ['ゼロ', '0'],
      ['指数表記', '1e3'],
      ['前後の空白', ' 5 '],
      ['小数', '1.5'],
    ])('%s のIDは400を返す', async (_label, id) => {
      const response = await GET(createRequest(id), {
        params: createParams(id),
      });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(mockGetCachedPersonDetail).not.toHaveBeenCalled();
    });
  });

  describe('404', () => {
    it('TMDbが404を返した場合は404を返す', async () => {
      mockGetCachedPersonDetail.mockRejectedValue(createNotFoundError());

      const response = await GET(createRequest('999999'), {
        params: createParams('999999'),
      });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('アダルト作品の出演者は404として扱う', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(
        createPerson({ adult: true }),
      );

      const response = await GET(createRequest('500'), {
        params: createParams('500'),
      });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });

  it('サーバーエラーで500を返す', async () => {
    mockGetCachedPersonDetail.mockRejectedValue(new Error('Internal error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const response = await GET(createRequest('500'), {
      params: createParams('500'),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe('SERVER_ERROR');

    consoleSpy.mockRestore();
  });

  describe('Cache-Control', () => {
    it('未認証ではCDNキャッシュ可能なヘッダーを返す', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(createPerson());

      const response = await GET(createRequest('500'), {
        params: createParams('500'),
      });

      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=86400, stale-while-revalidate=604800',
      );
    });

    it('認証済みでも同じpublicヘッダーを返す（ユーザー固有情報を含まないため）', async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });
      mockGetCachedPersonDetail.mockResolvedValue(createPerson());

      const response = await GET(createRequest('500'), {
        params: createParams('500'),
      });
      const json = await response.json();

      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=86400, stale-while-revalidate=604800',
      );
      // ユーザー固有情報が混ざっていないこと
      expect(json.data).not.toHaveProperty('favorite');
    });
  });

  describe('レート制限', () => {
    it('上限超過の場合はTMDbを呼ばずに429を返す', async () => {
      mockEnforcePublicRateLimit.mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 429 }),
      );

      const response = await GET(createRequest('500'), {
        params: createParams('500'),
      });

      expect(response.status).toBe(429);
      expect(mockGetCachedPersonDetail).not.toHaveBeenCalled();
    });

    it('不正なIDはレート制限を消費しない', async () => {
      const response = await GET(createRequest('abc'), {
        params: createParams('abc'),
      });

      expect(response.status).toBe(400);
      expect(mockEnforcePublicRateLimit).not.toHaveBeenCalled();
    });

    it('認証済みはユーザーIDで数える', async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });
      mockGetCachedPersonDetail.mockResolvedValue(createPerson());

      await GET(createRequest('500'), { params: createParams('500') });

      expect(mockEnforcePublicRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read_api_person_detail',
          userId: 'user-123',
        }),
      );
    });

    it('未認証はユーザーID未指定で数える（送信元単位になる）', async () => {
      mockGetCachedPersonDetail.mockResolvedValue(createPerson());

      await GET(createRequest('500'), { params: createParams('500') });

      expect(mockEnforcePublicRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read_api_person_detail',
          userId: undefined,
        }),
      );
    });
  });
});
