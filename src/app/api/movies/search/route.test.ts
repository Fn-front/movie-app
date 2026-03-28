/**
 * @jest-environment node
 */

/**
 * 映画検索API Route テスト
 */

import { GET } from './route';

// --- Mocks ---

const mockSearchMovies = jest.fn();
const mockDiscoverMovies = jest.fn();

jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: (...args: unknown[]) => mockSearchMovies(...args),
  discoverMovies: (...args: unknown[]) => mockDiscoverMovies(...args),
}));

// --- Helpers ---

function createRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/movies/search');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

const mockTMDbResponse = {
  page: 1,
  results: [
    {
      id: 1,
      title: 'アクション映画',
      overview: '概要',
      release_date: '2024-06-15',
      poster_path: '/poster1.jpg',
      vote_average: 8.0,
      popularity: 100,
      genre_ids: [28, 12],
      adult: false,
      original_language: 'en',
      original_title: 'Action Movie',
      backdrop_path: null,
      vote_count: 500,
    },
    {
      id: 2,
      title: 'コメディ映画',
      overview: '概要2',
      release_date: '2024-07-20',
      poster_path: '/poster2.jpg',
      vote_average: 6.5,
      popularity: 50,
      genre_ids: [35],
      adult: false,
      original_language: 'ja',
      original_title: 'Comedy Movie',
      backdrop_path: null,
      vote_count: 200,
    },
    {
      id: 3,
      title: 'SF映画',
      overview: '概要3',
      release_date: '2025-01-10',
      poster_path: '/poster3.jpg',
      vote_average: 9.0,
      popularity: 200,
      genre_ids: [878, 28],
      adult: false,
      original_language: 'en',
      original_title: 'Sci-Fi Movie',
      backdrop_path: null,
      vote_count: 1000,
    },
  ],
  total_pages: 5,
  total_results: 100,
};

// --- Tests ---

describe('GET /api/movies/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // === バリデーション ===

  describe('バリデーション', () => {
    it('検索条件なしで400を返す', async () => {
      const response = await GET(createRequest());
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('不正なページ番号で400を返す', async () => {
      const response = await GET(createRequest({ query: 'test', page: '0' }));

      expect(response.status).toBe(400);
    });

    it('不正なジャンルID形式で400を返す', async () => {
      const response = await GET(createRequest({ genre: 'abc' }));

      expect(response.status).toBe(400);
    });

    it('範囲外の評価値で400を返す', async () => {
      const response = await GET(
        createRequest({ query: 'test', vote_average_gte: '11' }),
      );

      expect(response.status).toBe(400);
    });
  });

  // === パターン1: キーワード検索 ===

  describe('キーワード検索（パターン1）', () => {
    it('キーワードのみで検索できる', async () => {
      mockSearchMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(createRequest({ query: 'アクション' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.movies).toHaveLength(3);
      expect(json.data.pagination.page).toBe(1);
      expect(json.data.pagination.isServerFiltered).toBe(false);
      expect(mockSearchMovies).toHaveBeenCalledWith({
        query: 'アクション',
        page: 1,
        year: undefined,
      });
    });

    it('キーワード + ページ指定で検索できる', async () => {
      mockSearchMovies.mockResolvedValue({ ...mockTMDbResponse, page: 2 });

      const response = await GET(createRequest({ query: 'test', page: '2' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.pagination.page).toBe(2);
      expect(mockSearchMovies).toHaveBeenCalledWith({
        query: 'test',
        page: 2,
        year: undefined,
      });
    });

    it('キーワード + 年代指定でyearをTMDb APIに渡す', async () => {
      mockSearchMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(
        createRequest({ query: 'test', year: '2024' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      // yearはTMDb API側で処理されるためサーバー側フィルタリングなし
      expect(json.data.pagination.isServerFiltered).toBe(false);
      expect(mockSearchMovies).toHaveBeenCalledWith({
        query: 'test',
        page: 1,
        year: 2024,
      });
    });
  });

  // === パターン1 + サーバー側フィルタリング ===

  describe('キーワード + フィルター（サーバー側フィルタリング）', () => {
    it('キーワード + ジャンルフィルターで結果を絞り込む', async () => {
      mockSearchMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(createRequest({ query: 'test', genre: '28' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.pagination.isServerFiltered).toBe(true);
      // genre_ids に 28 を含む映画のみ（id:1 と id:3）
      expect(json.data.movies).toHaveLength(2);
      expect(json.data.movies[0].id).toBe(1);
      expect(json.data.movies[1].id).toBe(3);
    });

    it('キーワード + 評価フィルターで結果を絞り込む', async () => {
      mockSearchMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(
        createRequest({ query: 'test', vote_average_gte: '7.5' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.pagination.isServerFiltered).toBe(true);
      // vote_average >= 7.5 の映画のみ（id:1[8.0] と id:3[9.0]）
      expect(json.data.movies).toHaveLength(2);
      expect(json.data.movies[0].id).toBe(1);
      expect(json.data.movies[1].id).toBe(3);
    });

    it('キーワード + ジャンル + 評価フィルターで結果を絞り込む', async () => {
      mockSearchMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(
        createRequest({
          query: 'test',
          genre: '28',
          vote_average_gte: '7.0',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.pagination.isServerFiltered).toBe(true);
      // genre_ids含む28 AND vote_average >= 7.0 → id:1とid:3
      expect(json.data.movies).toHaveLength(2);
    });

    it('フィルタリング後のtotal_resultsとtotal_pagesが更新される', async () => {
      mockSearchMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(createRequest({ query: 'test', genre: '35' }));
      const json = await response.json();

      // genre_ids に 35 を含む映画のみ（id:2）
      expect(json.data.movies).toHaveLength(1);
      expect(json.data.pagination.totalResults).toBe(1);
      expect(json.data.pagination.totalPages).toBe(1);
      expect(json.data.pagination.isServerFiltered).toBe(true);
    });

    it('release_dateが空文字の映画は年代フィルターで除外されない（yearはAPI側で処理）', async () => {
      const responseWithEmptyDate = {
        ...mockTMDbResponse,
        results: [
          ...mockTMDbResponse.results,
          {
            id: 4,
            title: '公開日未定映画',
            overview: '概要4',
            release_date: '',
            poster_path: null,
            vote_average: 7.0,
            popularity: 30,
            genre_ids: [28],
            adult: false,
            original_language: 'ja',
            original_title: 'TBD Movie',
            backdrop_path: null,
            vote_count: 10,
          },
        ],
      };
      mockSearchMovies.mockResolvedValue(responseWithEmptyDate);

      // yearはTMDb API側で処理。genreのサーバー側フィルタリングのみ
      const response = await GET(
        createRequest({ query: 'test', genre: '28', year: '2024' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      // genre_ids に 28 を含む映画（id:1, id:3, id:4）
      expect(json.data.movies).toHaveLength(3);
    });
  });

  // === パターン2: フィルターのみ検索 ===

  describe('フィルターのみ検索（パターン2）', () => {
    it('ジャンルフィルターのみでDiscover APIを使用する', async () => {
      mockDiscoverMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(createRequest({ genre: '28,12' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.pagination.isServerFiltered).toBe(false);
      expect(mockDiscoverMovies).toHaveBeenCalledWith({
        page: 1,
        with_genres: '28,12',
        primary_release_year: undefined,
        'vote_average.gte': undefined,
        sort_by: 'popularity.desc',
      });
      expect(mockSearchMovies).not.toHaveBeenCalled();
    });

    it('年代フィルターのみでDiscover APIを使用する', async () => {
      mockDiscoverMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(createRequest({ year: '2024' }));

      expect(response.status).toBe(200);
      expect(mockDiscoverMovies).toHaveBeenCalledWith(
        expect.objectContaining({ primary_release_year: 2024 }),
      );
    });

    it('評価フィルターのみでDiscover APIを使用する', async () => {
      mockDiscoverMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(createRequest({ vote_average_gte: '7.5' }));

      expect(response.status).toBe(200);
      expect(mockDiscoverMovies).toHaveBeenCalledWith(
        expect.objectContaining({ 'vote_average.gte': 7.5 }),
      );
    });

    it('複数フィルターでDiscover APIを使用する', async () => {
      mockDiscoverMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(
        createRequest({
          genre: '28',
          year: '2024',
          vote_average_gte: '7.0',
        }),
      );

      expect(response.status).toBe(200);
      expect(mockDiscoverMovies).toHaveBeenCalledWith({
        page: 1,
        with_genres: '28',
        primary_release_year: 2024,
        'vote_average.gte': 7.0,
        sort_by: 'popularity.desc',
      });
    });
  });

  // === Cache-Controlヘッダー ===

  describe('Cache-Controlヘッダー', () => {
    it('成功レスポンスにCache-Controlヘッダーが設定される', async () => {
      mockSearchMovies.mockResolvedValue(mockTMDbResponse);

      const response = await GET(createRequest({ query: 'test' }));

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=3600, stale-while-revalidate=86400',
      );
    });
  });

  // === エラーハンドリング ===

  describe('エラーハンドリング', () => {
    it('TMDb APIエラー時に500を返す', async () => {
      mockSearchMovies.mockRejectedValue(new Error('TMDb API error'));

      const response = await GET(createRequest({ query: 'test' }));
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('SERVER_ERROR');
    });

    it('Discover APIエラー時に500を返す', async () => {
      mockDiscoverMovies.mockRejectedValue(new Error('TMDb API error'));

      const response = await GET(createRequest({ genre: '28' }));
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('SERVER_ERROR');
    });
  });
});
