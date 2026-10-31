import { renderHook, act, waitFor } from '@testing-library/react';

import { useMovieList } from './useMovieList';
import type { UseMovieListOptions } from './useMovieList';
import type { GetMoviesResponse } from '@/lib/api/movies/movies';
import { createQueryWrapper } from '@/test/queryTestUtils';
import { STORAGE_KEYS } from '@/constants/common';
import { FILTER_ERROR_MESSAGES } from '@/constants/filters';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

let mockSessionStatus = 'unauthenticated';
let mockSessionData: { user?: { id: string; name: string } } | null = null;

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: mockSessionStatus,
    data: mockSessionData,
  }),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  usePathname: () => '/movies/now-showing',
  useSearchParams: () => mockSearchParams,
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
        vote_count: 1200,
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
    // フィルターは localStorage にも保存されるため、テスト間で持ち越さない
    window.localStorage.clear();
    mockSessionStatus = 'unauthenticated';
    mockSessionData = null;
    mockSearchParams = new URLSearchParams();
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
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };
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

    it('保存済みフィルター適用前にデフォルト値で映画取得が走らない', async () => {
      let resolveSavedFilter: (value: unknown) => void;
      mockGetSavedFilter.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSavedFilter = resolve;
          }),
      );

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      // savedFilter取得中は映画取得が走らない
      expect(mockGetMovies).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(true);

      // savedFilterが返ってきた後に映画取得が走る
      await act(async () => {
        resolveSavedFilter!({ sort_by: 'popularity' });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.sortBy).toBe('popularity');
      expect(mockGetMovies).toHaveBeenCalledWith(
        expect.objectContaining({ sort_by: 'popularity' }),
        expect.anything(),
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
            vote_count: 300,
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
    beforeEach(() => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };
    });

    it('認証時はハンドラー実行でフィルターが保存される', async () => {
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
      mockSessionStatus = 'unauthenticated';
      mockSessionData = null;

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

    it('handleSortChangeが全フィルター条件を含めて保存する', async () => {
      mockGetSavedFilter.mockResolvedValue({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [28],
        date_range_gte: '2026-03-01',
        is_revival: true,
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockSaveFilter.mockClear();

      act(() => {
        result.current.handleSortChange('vote_average');
      });

      await waitFor(() => {
        expect(mockSaveFilter).toHaveBeenCalled();
      });

      expect(mockSaveFilter.mock.calls[0][0]).toEqual({
        sort_by: 'vote_average',
        release_type: 'streaming',
        genre_ids: [28],
        date_range_gte: '2026-03-01',
        is_revival: true,
      });
    });

    it('handleReleaseTypeChangeが全フィルター条件を含めて保存する', async () => {
      mockGetSavedFilter.mockResolvedValue({
        sort_by: 'popularity',
        genre_ids: [12],
        is_revival: false,
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockSaveFilter.mockClear();

      act(() => {
        result.current.handleReleaseTypeChange('streaming');
      });

      await waitFor(() => {
        expect(mockSaveFilter).toHaveBeenCalled();
      });

      expect(mockSaveFilter.mock.calls[0][0]).toEqual({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [12],
        date_range_gte: '2026-02-11',
        is_revival: false,
      });
    });

    it('handleFilterApplyが全フィルター条件を含めて保存する', async () => {
      mockGetSavedFilter.mockResolvedValue({
        sort_by: 'popularity',
        release_type: 'streaming',
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockSaveFilter.mockClear();

      act(() => {
        result.current.handleFilterApply(
          [28, 878],
          { gte: '2026-04-01', lte: '2026-12-31' },
          true,
        );
      });

      await waitFor(() => {
        expect(mockSaveFilter).toHaveBeenCalled();
      });

      expect(mockSaveFilter.mock.calls[0][0]).toEqual({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [28, 878],
        date_range_gte: '2026-04-01',
        date_range_lte: '2026-12-31',
        is_revival: true,
      });
    });

    it('デフォルト値でもsort_byとrelease_typeは常に保存データに含まれる', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterApply([], {}, undefined);
      });

      await waitFor(() => {
        expect(mockSaveFilter).toHaveBeenCalled();
      });

      expect(mockSaveFilter.mock.calls[0][0]).toEqual({
        sort_by: 'release_date',
        release_type: 'theatrical',
      });
    });

    it('is_revival=falseが正しく保存される', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterApply([], {}, false);
      });

      await waitFor(() => {
        expect(mockSaveFilter).toHaveBeenCalled();
      });

      expect(mockSaveFilter.mock.calls[0][0]).toEqual({
        sort_by: 'release_date',
        release_type: 'theatrical',
        is_revival: false,
      });
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

    it('saveFilterエラー時にトーストが表示される', async () => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };
      mockSaveFilter.mockRejectedValue(new Error('Save Error'));

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockToast.mockClear();

      act(() => {
        result.current.handleSortChange('popularity');
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'エラー',
            description: FILTER_ERROR_MESSAGES.SAVE_FAILED,
            variant: 'error',
          }),
        );
      });
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
            vote_count: 120,
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
  describe('地域フィルタ', () => {
    it('初期状態では selectedRegions が空（＝全地域を除外）', () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.selectedRegions).toEqual([]);
    });

    it('URLの include_regions を初期stateに注入する', () => {
      mockSearchParams = new URLSearchParams({ include_regions: 'korea' });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.selectedRegions).toEqual(['korea']);
    });

    it('地域が空なら include_regions を送らない', async () => {
      renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalledWith(
          expect.objectContaining({ include_regions: undefined }),
          expect.anything(),
        );
      });
    });

    it('適用するとAPIパラメータに include_regions が載る', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => expect(mockGetMovies).toHaveBeenCalled());

      act(() => {
        result.current.handleFilterApply(
          [],
          {},
          undefined,
          [],
          [],
          ['chinese'],
        );
      });

      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalledWith(
          expect.objectContaining({ include_regions: 'chinese' }),
          expect.anything(),
        );
      });
      expect(result.current.selectedRegions).toEqual(['chinese']);
    });
  });

  describe('URLクエリによるフィルター永続化', () => {
    it('URLのフィルターを初期stateに注入する（デフォルト値を経由しない）', () => {
      mockSearchParams = new URLSearchParams({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: '28,12',
        is_revival: 'true',
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      // 初回レンダリング時点で復元済み（useEffectの後追い反映ではない）
      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.releaseType).toBe('streaming');
      expect(result.current.selectedGenreIds).toEqual([28, 12]);
      expect(result.current.isRevivalFilter).toBe(true);
    });

    it('URLの日付範囲を初期stateに注入する', () => {
      mockSearchParams = new URLSearchParams({
        date_range_gte: '2026-05-01',
        date_range_lte: '2026-06-30',
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.dateRange).toEqual({
        gte: '2026-05-01',
        lte: '2026-06-30',
      });
    });

    it('URLに日付がない場合はページ既定の日付範囲を使う', () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.dateRange.gte).toBe('2026-02-11');
    });

    it('URLの不正値はデフォルトにフォールバックし例外を投げない', () => {
      mockSearchParams = new URLSearchParams({
        sort_by: 'invalid',
        release_type: 'invalid',
        genre_ids: 'abc',
        date_range_gte: '2026/01/01',
        is_revival: 'maybe',
      });

      expect(() =>
        renderHook(() => useMovieList(defaultOptions), {
          wrapper: createQueryWrapper(),
        }),
      ).not.toThrow();

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.sortBy).toBe('release_date');
      expect(result.current.releaseType).toBe('theatrical');
      expect(result.current.selectedGenreIds).toEqual([]);
      expect(result.current.dateRange.gte).toBe('2026-02-11');
      expect(result.current.isRevivalFilter).toBeUndefined();
    });

    it('ソート変更をURLへreplaceで反映する（履歴を積まない）', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining('sort_by=popularity'),
        { scroll: false },
      );
    });

    it('フィルター適用をURLへ反映する', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterApply([28, 12], { gte: '2026-04-01' }, true);
      });

      const url = mockRouterReplace.mock.calls[0][0] as string;
      expect(url).toContain('genre_ids=28%2C12');
      expect(url).toContain('date_range_gte=2026-04-01');
      expect(url).toContain('is_revival=true');
    });

    it('ページ既定の日付範囲はURLに書き込まない（翌日以降に古い範囲で絞られるのを防ぐ）', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      const url = mockRouterReplace.mock.calls[0][0] as string;
      expect(url).not.toContain('date_range_gte');
    });

    it('未認証でもURL反映は行われる（保存APIは呼ばない）', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      expect(mockRouterReplace).toHaveBeenCalled();
      expect(mockSaveFilter).not.toHaveBeenCalled();
    });

    it('URLにフィルターがある場合、保存済みフィルターで上書きしない', async () => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };
      mockSearchParams = new URLSearchParams({ sort_by: 'popularity' });
      mockGetSavedFilter.mockResolvedValue({
        sort_by: 'vote_average',
        release_type: 'streaming',
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // URLが唯一の正。保存済みフィルターでは上書きされない
      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.releaseType).toBe('theatrical');
    });
  });
  describe('localStorageによるフィルター永続化（ナビリンク経由）', () => {
    /** localStorage にフィルターを仕込む */
    const seedStorage = (conditions: Record<string, unknown>) => {
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify(conditions),
      );
    };

    it('URLにクエリが無い場合、localStorageから初期stateに復元する', () => {
      seedStorage({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [28],
        is_revival: true,
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.releaseType).toBe('streaming');
      expect(result.current.selectedGenreIds).toEqual([28]);
      expect(result.current.isRevivalFilter).toBe(true);
    });

    it('URLにクエリがある場合、localStorageより優先される', () => {
      seedStorage({ sort_by: 'vote_average', release_type: 'streaming' });
      mockSearchParams = new URLSearchParams({ sort_by: 'popularity' });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.sortBy).toBe('popularity');
      // URLが正なので、URLに無いrelease_typeはデフォルトに戻る
      expect(result.current.releaseType).toBe('theatrical');
    });

    it('localStorageの不正値はデフォルトにフォールバックする', () => {
      seedStorage({ sort_by: 'invalid', genre_ids: 'abc' });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.sortBy).toBe('release_date');
      expect(result.current.selectedGenreIds).toEqual([]);
    });

    it('フィルター変更をlocalStorageに保存する', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      const stored = JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.MOVIE_FILTERS) ?? '{}',
      );
      expect(stored.sort_by).toBe('popularity');
    });

    it('ページ既定の日付範囲はlocalStorageにも書き込まない（端末に焼き付かせない）', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      const stored = JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.MOVIE_FILTERS) ?? '{}',
      );
      expect(stored.date_range_gte).toBeUndefined();
    });

    it('ユーザー指定の日付範囲はlocalStorageに保存する', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterApply([], { gte: '2026-05-01' }, undefined);
      });

      const stored = JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.MOVIE_FILTERS) ?? '{}',
      );
      expect(stored.date_range_gte).toBe('2026-05-01');
    });

    it('localStorageに値がある場合、保存済みフィルターで上書きしない', async () => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };
      seedStorage({ sort_by: 'popularity' });
      mockGetSavedFilter.mockResolvedValue({
        sort_by: 'vote_average',
        release_type: 'streaming',
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.sortBy).toBe('popularity');
    });

    it('URL・localStorageとも空なら保存済みフィルターを使う', async () => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };
      mockGetSavedFilter.mockResolvedValue({
        sort_by: 'vote_average',
        release_type: 'streaming',
      });

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.sortBy).toBe('vote_average');
      });
      expect(result.current.releaseType).toBe('streaming');
    });
  });
});
