/**
 * @jest-environment node
 */

/**
 * 映画詳細API Route テスト
 */

import { AxiosError } from 'axios';

import { GET } from './route';

// --- Mocks ---

const mockGetMovieDetail = jest.fn();

jest.mock('@/lib/tmdb/tmdb', () => ({
  getMovieDetail: (...args: unknown[]) => mockGetMovieDetail(...args),
}));

const mockGetAuthSession = jest.fn().mockResolvedValue(null);
jest.mock('@/helpers/auth', () => ({
  getAuthSession: (...args: unknown[]) => mockGetAuthSession(...args),
}));

const mockFrom = jest.fn();
const mockCreateServiceRoleClient = jest
  .fn()
  .mockReturnValue({ from: mockFrom });
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: (...args: unknown[]) =>
    mockCreateServiceRoleClient(...args),
}));

// --- Helpers ---

const createRequest = (id: string) =>
  new Request(`http://localhost/api/movies/${id}`);

const createParams = (id: string) => Promise.resolve({ id });

// --- Tests ---

describe('GET /api/movies/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常に映画詳細を返す', async () => {
    const mockMovie = {
      id: 123,
      title: 'テスト映画',
      overview: 'テスト概要',
      runtime: 120,
      genres: [{ id: 28, name: 'アクション' }],
    };
    mockGetMovieDetail.mockResolvedValue(mockMovie);

    const response = await GET(createRequest('123'), {
      params: createParams('123'),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(mockMovie);
    expect(mockGetMovieDetail).toHaveBeenCalledWith(123);
  });

  it('不正なIDで400を返す', async () => {
    const response = await GET(createRequest('abc'), {
      params: createParams('abc'),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('負のIDで400を返す', async () => {
    const response = await GET(createRequest('-1'), {
      params: createParams('-1'),
    });

    expect(response.status).toBe(400);
  });

  it('TMDb APIが404を返した場合404を返す', async () => {
    const error = new AxiosError('Not Found', '404', undefined, undefined, {
      status: 404,
      data: {},
      statusText: 'Not Found',
      headers: {},
      config: { headers: {} },
    } as never);
    mockGetMovieDetail.mockRejectedValue(error);

    const response = await GET(createRequest('999999'), {
      params: createParams('999999'),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('サーバーエラーで500を返す', async () => {
    mockGetMovieDetail.mockRejectedValue(new Error('Internal error'));

    const response = await GET(createRequest('123'), {
      params: createParams('123'),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
  });

  // === お気に入り情報の付与 ===

  it('認証済みユーザーの場合、favoriteフィールドが付与される', async () => {
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });
    const mockMovie = {
      id: 123,
      title: 'テスト映画',
      overview: 'テスト概要',
    };
    mockGetMovieDetail.mockResolvedValue(mockMovie);

    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({
                data: { id: 'fav-1', rating: 8 },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(createRequest('123'), {
      params: createParams('123'),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.favorite).toEqual({ id: 'fav-1', rating: 8 });
  });

  it('認証済みだがお気に入り未登録の場合、favoriteがnullになる', async () => {
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });
    const mockMovie = {
      id: 456,
      title: '未登録映画',
    };
    mockGetMovieDetail.mockResolvedValue(mockMovie);

    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(createRequest('456'), {
      params: createParams('456'),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.favorite).toBeNull();
  });

  it('認証済みだがSupabaseクライアントがnullの場合、favoriteフィールドが含まれない', async () => {
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });
    mockCreateServiceRoleClient.mockReturnValueOnce(null);
    const mockMovie = {
      id: 789,
      title: 'Supabase未接続映画',
    };
    mockGetMovieDetail.mockResolvedValue(mockMovie);

    const response = await GET(createRequest('789'), {
      params: createParams('789'),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.favorite).toBeUndefined();
  });

  it('未認証の場合、favoriteフィールドが含まれない', async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const mockMovie = {
      id: 123,
      title: 'テスト映画',
    };
    mockGetMovieDetail.mockResolvedValue(mockMovie);

    const response = await GET(createRequest('123'), {
      params: createParams('123'),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.favorite).toBeUndefined();
  });
});
