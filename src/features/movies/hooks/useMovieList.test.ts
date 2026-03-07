import { renderHook, act, waitFor } from '@testing-library/react';

import { useMovieList } from './useMovieList';
import type { UseMovieListOptions } from './useMovieList';
import type { GetMoviesResponse } from '@/lib/api/movies/movies';
import { createQueryWrapper } from '@/test/queryTestUtils';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

let mockSessionStatus = 'unauthenticated';
let mockSessionData: { user?: { name: string } } | null = null;

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: mockSessionStatus,
    data: mockSessionData,
  }),
}));

const mockGetMovies = jest.fn();
jest.mock('@/lib/api/movies/movies', () => ({
  getMovies: (...args: unknown[]) => mockGetMovies(...args),
}));

const mockGetSavedFilter = jest.fn();
const mockSaveFilter = jest.fn();
jest.mock('@/lib/api/filters/filters', () => ({
  getSavedFilter: (...args: unknown[]) => mockGetSavedFilter(...args),
  saveFilter: (...args: unknown[]) => mockSaveFilter(...args),
}));

// --- Helpers ---

const createMockResponse = (
  overrides?: Partial<GetMoviesResponse['data']>,
): GetMoviesResponse => ({
  success: true,
  data: {
    movies: [
      {
        id: 1,
        title: 'テスト映画',
        poster_path: '/test.jpg',
        backdrop_path: null,
        release_date: '2026-03-01',
        overview: 'テスト概要',
        vote_average: 7.5,
        popularity: 100,
        genre_ids: [28],
        release_type: 'theatrical',
        is_revival: false,
      },
    ],
    pagination: {
      currentPage: 1,
      totalPages: 3,
      totalItems: 50,
      itemsPerPage: 20,
      hasNextPage: true,
      nextPage: 2,
    },
    genres: { 28: 'アクション' },
    ...overrides,
  },
});

const defaultOptions: UseMovieListOptions = {
  timeFrame: 'upcoming',
  defaultDateRange: { gte: '2026-02-11' },
};

// --- Tests ---

describe('useMovieList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionStatus = 'unauthenticated';
    mockSessionData = null;
    mockGetMovies.mockResolvedValue(createMockResponse());
    mockGetSavedFilter.mockResolvedValue({});
    mockSaveFilter.mockResolvedValue(undefined);
  });

  describe('初期状態', () => {
    it('isLoadingがtrueで初期化される', () => {
      mockSessionStatus = 'loading';
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.movies).toEqual([]);
      expect(result.current.sortBy).toBe('release_date');
      expect(result.current.releaseType).toBe('theatrical');
    });

    it('セッションloading中はフェッチしない', () => {
      mockSessionStatus = 'loading';
      renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(mockGetMovies).not.toHaveBeenCalled();
    });
  });

  describe('未認証時の初回フェッチ', () => {
    it('デフォルト値で映画を取得する', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMovies).toHaveBeenCalledTimes(1);
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          sort_by: 'release_date',
          release_type: 'theatrical',
          time_frame: 'upcoming',
          release_date_gte: '2026-02-11',
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('取得結果がstateに反映される', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.movies).toHaveLength(1);
      expect(result.current.movies[0].title).toBe('テスト映画');
      expect(result.current.hasNextPage).toBe(true);
      expect(result.current.genres).toEqual({ 28: 'アクション' });
    });

    it('getSavedFilterを呼ばない', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetSavedFilter).not.toHaveBeenCalled();
    });
  });

  describe('認証時の保存済みフィルター読み込み', () => {
    beforeEach(() => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { name: 'テストユーザー' } };
    });

    it('保存済みフィルターがある場合、stateに反映してフェッチする', async () => {
      mockGetSavedFilter.mockResolvedValue({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [28, 12],
        is_revival: false,
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.releaseType).toBe('streaming');
      expect(result.current.selectedGenreIds).toEqual([28, 12]);
      expect(result.current.isRevivalFilter).toBe(false);
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'popularity',
          release_type: 'streaming',
          genre_ids: '28,12',
          is_revival: false,
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('保存済みフィルターが空の場合、デフォルト値でフェッチする', async () => {
      mockGetSavedFilter.mockResolvedValue({});

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'release_date',
          release_type: 'theatrical',
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('getSavedFilterがエラーの場合、デフォルト値でフェッチする', async () => {
      mockGetSavedFilter.mockRejectedValue(new Error('API Error'));

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'release_date',
          release_type: 'theatrical',
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('defaultSortOrder', () => {
    it('sort_orderパラメータとしてgetMoviesに渡される', async () => {
      const options: UseMovieListOptions = {
        ...defaultOptions,
        defaultSortOrder: 'desc',
      };
      const { result } = renderHook(() => useMovieList(options), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 'desc' }),
        expect.anything(),
      );
    });

    it('未指定の場合sort_orderはundefined', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: undefined }),
        expect.anything(),
      );
    });
  });

  describe('ハンドラー', () => {
    it('handleSortChangeでソートが変更されリフェッチされる', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetMovies.mockClear();

      act(() => {
        result.current.handleSortChange('popularity');
      });

      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalled();
      });

      expect(result.current.sortBy).toBe('popularity');
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({ sort_by: 'popularity', page: 1 }),
        expect.anything(),
      );
    });

    it('handleReleaseTypeChangeでリリースタイプが変更される', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetMovies.mockClear();

      act(() => {
        result.current.handleReleaseTypeChange('streaming');
      });

      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalled();
      });

      expect(result.current.releaseType).toBe('streaming');
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({ release_type: 'streaming' }),
        expect.anything(),
      );
    });

    it('handleFilterApplyでフィルターが適用されモーダルが閉じる', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterModalOpen();
      });

      expect(result.current.isFilterModalOpen).toBe(true);

      mockGetMovies.mockClear();

      act(() => {
        result.current.handleFilterApply(
          [28, 12],
          { gte: '2026-03-01', lte: '2026-04-01' },
          true,
        );
      });

      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalled();
      });

      expect(result.current.selectedGenreIds).toEqual([28, 12]);
      expect(result.current.dateRange).toEqual({
        gte: '2026-03-01',
        lte: '2026-04-01',
      });
      expect(result.current.isRevivalFilter).toBe(true);
      expect(result.current.isFilterModalOpen).toBe(false);
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({
          genre_ids: '28,12',
          release_date_gte: '2026-03-01',
          release_date_lte: '2026-04-01',
          is_revival: true,
        }),
        expect.anything(),
      );
    });

    it('handleFilterModalOpen/Closeでモーダル状態が切り替わる', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isFilterModalOpen).toBe(false);

      act(() => {
        result.current.handleFilterModalOpen();
      });
      expect(result.current.isFilterModalOpen).toBe(true);

      act(() => {
        result.current.handleFilterModalClose();
      });
      expect(result.current.isFilterModalOpen).toBe(false);
    });
  });

  describe('無限スクロール', () => {
    it('hasNextPageがtrueの場合fetchNextPageで次ページを取得できる', async () => {
      const page2Response = createMockResponse({
        movies: [
          {
            id: 2,
            title: '2番目の映画',
            poster_path: null,
            backdrop_path: null,
            release_date: '2026-03-02',
            overview: null,
            vote_average: 6,
            popularity: 80,
            genre_ids: [12],
            release_type: 'theatrical',
            is_revival: false,
          },
        ],
        pagination: {
          currentPage: 2,
          totalPages: 3,
          totalItems: 50,
          itemsPerPage: 20,
          hasNextPage: true,
          nextPage: 3,
        },
      });

      mockGetMovies
        .mockResolvedValueOnce(createMockResponse())
        .mockResolvedValueOnce(page2Response);

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.fetchNextPage();
      });

      await waitFor(() => {
        expect(result.current.movies).toHaveLength(2);
      });

      expect(result.current.movies[0].title).toBe('テスト映画');
      expect(result.current.movies[1].title).toBe('2番目の映画');
    });

    it('最終ページではhasNextPageがfalseになる', async () => {
      mockGetMovies.mockResolvedValue(
        createMockResponse({
          pagination: {
            currentPage: 3,
            totalPages: 3,
            totalItems: 50,
            itemsPerPage: 20,
            hasNextPage: false,
            nextPage: null,
          },
        }),
      );

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe('フィルター保存', () => {
    it('認証時はハンドラー実行でフィルターが保存される', async () => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { name: 'テストユーザー' } };

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      await waitFor(() => {
        expect(mockSaveFilter).toHaveBeenCalled();
      });

      expect(mockSaveFilter.mock.calls[0][0]).toEqual(
        expect.objectContaining({ sort_by: 'popularity' }),
      );
    });

    it('未認証時はフィルターが保存されない', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      expect(mockSaveFilter).not.toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('getMoviesエラー時にトーストが表示される', async () => {
      mockGetMovies.mockRejectedValue(new Error('Network Error'));

      renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'エラー',
          variant: 'error',
        }),
      );
    });
  });

  describe('TanStack Query統合', () => {
    it('クエリキーが変更されると自動的にリフェッチされる', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetMovies.mockClear();

      const newResponse = createMockResponse({
        movies: [
          {
            id: 2,
            title: '2番目の映画',
            poster_path: null,
            backdrop_path: null,
            release_date: '2026-03-01',
            overview: null,
            vote_average: 5,
            popularity: 50,
            genre_ids: [],
            release_type: 'streaming',
            is_revival: false,
          },
        ],
      });
      mockGetMovies.mockResolvedValueOnce(newResponse);

      act(() => {
        result.current.handleReleaseTypeChange('streaming');
      });

      await waitFor(() => {
        expect(result.current.movies[0]?.title).toBe('2番目の映画');
      });
    });
  });
});
