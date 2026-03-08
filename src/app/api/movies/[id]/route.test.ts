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
});
