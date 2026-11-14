import { renderHook, act, waitFor } from '@testing-library/react';

import { useMovieList, hasActiveFilterConditions } from './useMovieList';
import type { UseMovieListOptions } from './useMovieList';
import type { GetMoviesResponse } from '@/lib/api/movies/movies';
import { createQueryWrapper } from '@/test/queryTestUtils';
import { STORAGE_KEYS } from '@/constants/common';
import { FILTER_ERROR_MESSAGES } from '@/constants/filters';
import { filterConditionsSchema } from '@/schema/filters';
import type { FilterConditions } from '@/schema/filters';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
  useToastDispatch: () => ({ toast: mockToast }),
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

/**
 * 本番と同じく options を**毎レンダー新しいオブジェクト**で渡して描画する。
 *
 * `useNowShowing` / `useUpcoming` / `useHome` はいずれも
 * `defaultDateRange: {}` をレンダーのたびに作り直して渡す。モジュール定数の
 * `defaultOptions` で描画すると identity が安定してしまい、依存配列に
 * 毎レンダー変わる値を混ぜた欠陥を**構造的に踏めない**（#1059 B-1）。
 * URL と state の同期に関わるテストはこちらを使うこと。
 */
const renderMovieList = () =>
  renderHook(
    () =>
      useMovieList({
        timeFrame: 'upcoming',
        defaultDateRange: { gte: '2026-02-11' },
      }),
    { wrapper: createQueryWrapper() },
  );

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

  /**
   * 戻る／進むでURLが変わったときの追従（#1051）
   *
   * Next の `useSearchParams` は popstate でも更新されるため、ここでは
   * `mockSearchParams` を差し替えて再レンダリングすることで戻る／進むを模す。
   */
  describe('URL変更への追従（戻る／進む）', () => {
    /** 戻る／進むでURLが変わった状態にする */
    const navigateTo = (query: Record<string, string>) => {
      mockSearchParams = new URLSearchParams(query);
    };

    it('戻ってクエリが消えたら、絞り込みも解除される', async () => {
      navigateTo({
        sort_by: 'popularity',
        genre_ids: '28',
        is_revival: 'true',
      });

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.selectedGenreIds).toEqual([28]);

      navigateTo({});
      rerender();

      expect(result.current.sortBy).toBe('release_date');
      expect(result.current.selectedGenreIds).toEqual([]);
      expect(result.current.isRevivalFilter).toBeUndefined();
    });

    it('URLから消えた条件はAPIリクエストからも外れる', async () => {
      navigateTo({ genre_ids: '28' });

      const { rerender } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalledWith(
          expect.objectContaining({ genre_ids: '28' }),
          expect.anything(),
        );
      });

      navigateTo({});
      rerender();

      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalledWith(
          expect.objectContaining({ genre_ids: undefined }),
          expect.anything(),
        );
      });
    });

    it('進んでクエリが戻ったら、その条件で絞り込み直す', async () => {
      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.selectedGenreIds).toEqual([]);

      navigateTo({
        genre_ids: '12,16',
        release_type: 'streaming',
        date_range_gte: '2026-05-01',
      });
      rerender();

      expect(result.current.selectedGenreIds).toEqual([12, 16]);
      expect(result.current.releaseType).toBe('streaming');
      expect(result.current.dateRange.gte).toBe('2026-05-01');
    });

    it('URLに日付が無くなればページ既定の範囲に戻す', async () => {
      navigateTo({
        date_range_gte: '2026-05-01',
        date_range_lte: '2026-06-30',
      });

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      navigateTo({});
      rerender();

      expect(result.current.dateRange).toEqual({
        gte: '2026-02-11',
        lte: undefined,
      });
    });

    it('URL追従ではURLを書き戻さない（replaceのループを作らない）', async () => {
      navigateTo({ genre_ids: '28' });

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      mockRouterReplace.mockClear();

      navigateTo({});
      rerender();

      expect(result.current.selectedGenreIds).toEqual([]);
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it('自分が書いたURLに追従しても、ソートの状態もURLも揺り戻さない', async () => {
      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      // router.replace の結果を Next が searchParams へ反映した状態を作る
      const url = mockRouterReplace.mock.calls[0][0] as string;
      mockSearchParams = new URLSearchParams(url.split('?')[1] ?? '');
      rerender();

      expect(result.current.sortBy).toBe('popularity');
      expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    });

    it('クエリが変わっていない再レンダリングでは復元済みの状態を壊さない', async () => {
      // localStorage 由来の復元はURLに現れない。URLが変わっていないのに
      // 追従処理が走ると、空のクエリでこれを消してしまう
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify({ sort_by: 'popularity', genre_ids: [28] }),
      );

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.sortBy).toBe('popularity');

      // useSearchParams は再レンダリングのたびに別インスタンスを返しうる
      mockSearchParams = new URLSearchParams();
      rerender();

      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.selectedGenreIds).toEqual([28]);
    });

    it('URL変更のあとに届いた保存済みフィルターで上書きしない', async () => {
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };

      let resolveSavedFilter: (
        value: Record<string, unknown>,
      ) => void = () => {};
      mockGetSavedFilter.mockReturnValue(
        new Promise<Record<string, unknown>>((resolve) => {
          resolveSavedFilter = resolve;
        }),
      );

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      // 戻る／進むでURLにフィルターが現れる
      navigateTo({ sort_by: 'popularity' });
      rerender();
      expect(result.current.sortBy).toBe('popularity');

      // 遅れて保存済みフィルターが届いてもURLが正
      await act(async () => {
        resolveSavedFilter({
          sort_by: 'vote_average',
          release_type: 'streaming',
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.releaseType).toBe('theatrical');
    });

    it('URL変更と保存済みフィルター到着が同じコミットでもURLが勝つ', async () => {
      // 逐次なら上のテストで押さえているが、同じコミットに乗ると
      // 復元 effect が古い savedFilterApplied を読んで踏み潰す（#1059 S-1）。
      // 自己修復しないため、この食い違いは以降ずっと残る
      mockSessionStatus = 'authenticated';
      mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };

      let resolveSavedFilter: (
        value: Record<string, unknown>,
      ) => void = () => {};
      mockGetSavedFilter.mockReturnValue(
        new Promise<Record<string, unknown>>((resolve) => {
          resolveSavedFilter = resolve;
        }),
      );

      const { result, rerender } = renderMovieList();

      await act(async () => {
        navigateTo({ sort_by: 'popularity' });
        resolveSavedFilter({
          sort_by: 'vote_average',
          release_type: 'streaming',
        });
        rerender();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.releaseType).toBe('theatrical');
    });

    it('戻ると配信プロバイダー・提供形態・地域も解除される', async () => {
      // バッジ（hasActiveFilters）はこの3つを見ないため、E2Eでは観測できない
      navigateTo({
        release_type: 'streaming',
        watch_providers: '8,9',
        offer_types: 'flatrate',
        include_regions: 'korea',
      });

      const { result, rerender } = renderMovieList();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.selectedWatchProviderIds).toEqual([8, 9]);
      expect(result.current.selectedOfferTypes).toEqual(['flatrate']);
      expect(result.current.selectedRegions).toEqual(['korea']);

      navigateTo({});
      rerender();

      expect(result.current.releaseType).toBe('theatrical');
      expect(result.current.selectedWatchProviderIds).toEqual([]);
      expect(result.current.selectedOfferTypes).toEqual([]);
      expect(result.current.selectedRegions).toEqual([]);
    });

    it('進むと配信プロバイダー・提供形態・地域が復元される', async () => {
      const { result, rerender } = renderMovieList();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      navigateTo({
        release_type: 'streaming',
        watch_providers: '8,9',
        offer_types: 'flatrate',
        include_regions: 'korea',
      });
      rerender();

      expect(result.current.releaseType).toBe('streaming');
      expect(result.current.selectedWatchProviderIds).toEqual([8, 9]);
      expect(result.current.selectedOfferTypes).toEqual(['flatrate']);
      expect(result.current.selectedRegions).toEqual(['korea']);
    });

    it('自分が書いたURLが着地しても、触っていない条件のstateを作り直さない', async () => {
      navigateTo({ genre_ids: '28' });

      const { result, rerender } = renderMovieList();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const genreIdsBefore = result.current.selectedGenreIds;

      act(() => {
        result.current.handleSortChange('popularity');
      });

      // ソートしか変えていないので、ジャンルは同じ配列の実体のまま
      expect(result.current.selectedGenreIds).toBe(genreIdsBefore);

      // router.replace の結果を Next が searchParams へ反映した状態を作る
      const url = mockRouterReplace.mock.calls[0][0] as string;
      mockSearchParams = new URLSearchParams(url.split('?')[1] ?? '');
      rerender();

      // 自分で書いたURLなので追従は走らない。走ると同じ内容の別配列に化ける
      expect(result.current.selectedGenreIds).toBe(genreIdsBefore);
      expect(result.current.sortBy).toBe('popularity');
    });

    it('フィルター以外のクエリが付いた入口でも、localStorageの復元を消さない', async () => {
      // 計測パラメータ付きのURLは実在の経路。マウント時のクエリを
      // 基準にしていないと、ここで追従が走って復元を消す
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify({ sort_by: 'popularity', genre_ids: [28] }),
      );
      navigateTo({ utm_source: 'newsletter' });

      const { result, rerender } = renderMovieList();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.selectedGenreIds).toEqual([28]);

      navigateTo({ utm_source: 'newsletter' });
      rerender();

      expect(result.current.sortBy).toBe('popularity');
      expect(result.current.selectedGenreIds).toEqual([28]);
    });
  });

  /**
   * options を毎レンダー作り直す呼び出し方での回帰（#1059 B-1）
   *
   * 追従 effect の依存配列に毎レンダー変わる値が混ざると、URLが変わって
   * いなくても再実行される。`router.replace` はトランジションなので同期
   * レーンのコミットが先に走り、そのとき searchParams はまだ古い。
   * 結果、適用・ソート変更の**直後に state が巻き戻る**。
   */
  describe('options を毎レンダー新しいオブジェクトで渡す場合', () => {
    it('フィルター適用の直後に絞り込みが巻き戻らない', async () => {
      const { result } = renderMovieList();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      mockGetMovies.mockClear();

      act(() => {
        result.current.handleFilterApply([28], {}, undefined);
      });

      expect(result.current.selectedGenreIds).toEqual([28]);

      const url = mockRouterReplace.mock.calls[0][0] as string;
      expect(url).toContain('genre_ids=28');

      // 巻き戻ると、絞り込み無しの余分なリクエストが混ざる
      await waitFor(() => {
        expect(mockGetMovies).toHaveBeenCalled();
      });
      const requestedGenreIds = mockGetMovies.mock.calls.map(
        (call) => (call[0] as { genre_ids?: string }).genre_ids,
      );
      expect(requestedGenreIds).toEqual(['28']);
    });

    it('ソート変更の直後に前の値へ戻らない', async () => {
      const { result } = renderMovieList();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleSortChange('popularity');
      });

      expect(result.current.sortBy).toBe('popularity');
    });

    it('フィルター適用の直後に日付範囲が巻き戻らない', async () => {
      const { result } = renderMovieList();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterApply([], { gte: '2026-05-01' }, true);
      });

      expect(result.current.dateRange.gte).toBe('2026-05-01');
      expect(result.current.isRevivalFilter).toBe(true);
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

  /**
   * 映画詳細モーダルのクエリ（#1033）との噛み合わせ
   *
   * モーダルは一覧の URL に `movie_id` を足して開く。URL追従のガードが
   * クエリ文字列**全体**を比べていると、開閉のたびにフィルター state を
   * 作り直してしまう。条件の値は同じでも**配列の実体が別物に差し替わる**ため
   * React.memo が広範囲で無効化され、saved_filters の打ち切りフラグも立つ。
   */
  describe('映画詳細モーダルのクエリ（movie_id）', () => {
    const navigateTo = (query: Record<string, string>) => {
      mockSearchParams = new URLSearchParams(query);
    };

    it('movie_id を足してもフィルター state の参照が変わらない', async () => {
      navigateTo({ genre_ids: '28,12', sort_by: 'popularity' });

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const genreIdsBefore = result.current.selectedGenreIds;
      const dateRangeBefore = result.current.dateRange;

      navigateTo({
        genre_ids: '28,12',
        sort_by: 'popularity',
        movie_id: '550',
      });
      rerender();

      expect(result.current.selectedGenreIds).toBe(genreIdsBefore);
      expect(result.current.dateRange).toBe(dateRangeBefore);
      expect(result.current.sortBy).toBe('popularity');
    });

    it('movie_id を外してもフィルター state の参照が変わらない', async () => {
      navigateTo({ genre_ids: '28,12', movie_id: '550' });

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const genreIdsBefore = result.current.selectedGenreIds;

      navigateTo({ genre_ids: '28,12' });
      rerender();

      expect(result.current.selectedGenreIds).toBe(genreIdsBefore);
    });

    // movie_id の増減でURLを書き戻すと、モーダルを開くたびに replace が走る
    it('movie_id の増減でURLを書き戻さない', async () => {
      navigateTo({ genre_ids: '28' });

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      mockRouterReplace.mockClear();

      navigateTo({ genre_ids: '28', movie_id: '550' });
      rerender();

      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    // movie_id が付いていてもフィルターの変更自体は従来どおり追従する
    it('movie_id が付いたままでもフィルターの変更には追従する', async () => {
      navigateTo({ genre_ids: '28', movie_id: '550' });

      const { result, rerender } = renderHook(
        () => useMovieList(defaultOptions),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.selectedGenreIds).toEqual([28]);

      navigateTo({ genre_ids: '12,16', movie_id: '550' });
      rerender();

      expect(result.current.selectedGenreIds).toEqual([12, 16]);
    });
  });
  /**
   * 絞り込み中の判定（#1063）
   *
   * 以前は表示側（`movieListToolbar`）が条件を手で並べており、配信プロバイダー・
   * 提供形態・地域の3つが漏れていた。**一覧は絞り込まれているのに印が出ない**。
   *
   * ⚠️ **ここでキーを手で並べないこと。** 並べたら同じ漏れが起きる。
   * zod スキーマ（`filterConditionsSchema`）が条件の唯一の出どころなので、
   * そこから列挙する。新しい条件が増えたら、このテストが自動で面倒を見る。
   */
  describe('絞り込み中の判定', () => {
    /** 並び順とタブの切り替えは「絞り込み」ではない */
    const NON_FILTER_KEYS = ['sort_by', 'release_type'] as const;

    const ALL_KEYS = Object.keys(
      filterConditionsSchema.shape,
    ) as (keyof FilterConditions)[];

    const FILTER_KEYS = ALL_KEYS.filter(
      (key) =>
        !NON_FILTER_KEYS.includes(key as (typeof NON_FILTER_KEYS)[number]),
    );

    /** 各条件の代表値 */
    const SAMPLE: Partial<Record<keyof FilterConditions, unknown>> = {
      genre_ids: [28],
      date_range_gte: '2026-03-01',
      date_range_lte: '2026-12-31',
      is_revival: false,
      watch_providers: [8],
      offer_types: ['flatrate'],
      include_regions: ['korea'],
    };

    /** 常に入るキーだけを持つ、絞り込み無しの状態 */
    const baseConditions = {
      sort_by: 'release_date',
      release_type: 'theatrical',
    } as FilterConditions;

    it('スキーマの条件すべてに代表値を用意している', () => {
      // 条件が増えたのに SAMPLE を足し忘れると、下の it.each が
      // undefined を入れて素通りする。先にここで気づく
      const missing = FILTER_KEYS.filter((key) => SAMPLE[key] === undefined);

      expect(missing).toEqual([]);
      expect(FILTER_KEYS.length).toBeGreaterThan(0);
    });

    it.each(FILTER_KEYS)('%s だけでも絞り込み中になる', (key) => {
      expect(
        hasActiveFilterConditions({
          ...baseConditions,
          [key]: SAMPLE[key],
        } as FilterConditions),
      ).toBe(true);
    });

    it('並び順とタブだけなら絞り込み中にならない', () => {
      expect(hasActiveFilterConditions(baseConditions)).toBe(false);
    });

    it('条件が1つも無ければ絞り込み中にならない', () => {
      expect(hasActiveFilterConditions({})).toBe(false);
    });
  });

  /**
   * 配信プロバイダーだけで絞り込んだときに印が出るか（#1063 の実害）
   *
   * 上の判定の単体テストと別に、**フックが実際にその値を返すか**を見る。
   * 判定関数が正しくても、呼び出し側が古い条件を渡していたら意味が無い。
   */
  describe('hasActiveFilters（フックの返り値）', () => {
    it('初期状態では false', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('配信プロバイダーだけを適用しても true になる', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterApply([], {}, undefined, [8]);
      });

      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('地域だけを適用しても true になる', async () => {
      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.handleFilterApply([], {}, undefined, [], [], ['korea']);
      });

      expect(result.current.hasActiveFilters).toBe(true);
    });
  });
  /**
   * 復元した絞り込みを URL へ書き戻す（#1062）
   *
   * #1051 で「URL が正」にしたのは履歴操作の経路だけで、マウント時の復元は
   * URL と食い違ったまま残っていた。ナビリンクで往復すると「URL は空なのに
   * 一覧だけ絞り込まれている」状態になる。
   */
  describe('復元結果のURL書き戻し（#1062）', () => {
    const navigateTo = (query: Record<string, string>) => {
      mockSearchParams = new URLSearchParams(query);
    };

    /** `router.replace` に渡ったクエリ文字列（呼ばれていなければ null） */
    const replacedSearch = (): string | null => {
      const call = mockRouterReplace.mock.calls[0];
      if (!call) return null;
      return (call[0] as string).split('?')[1] ?? '';
    };

    it('localStorage に絞り込みがあればURLへ書き戻す', async () => {
      navigateTo({});
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify({ sort_by: 'popularity', genre_ids: [28] }),
      );

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalled();
      });
      expect(replacedSearch()).toContain('genre_ids=28');
      expect(result.current.selectedGenreIds).toEqual([28]);
    });

    /**
     * ⚠️ `buildFilterConditions` は sort_by と release_type を常に入れるため、
     * 無条件に書き戻すと並び順を変えただけの利用者が全ページで URL を
     * 書き換えられる。直すべき食い違い（URL は空なのに絞り込み中の印が出る）は
     * そこには無い
     */
    it('並び順だけの復元では書き戻さない', async () => {
      navigateTo({});
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify({ sort_by: 'popularity', release_type: 'streaming' }),
      );

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      // 復元はされるが URL は触らない
      expect(result.current.sortBy).toBe('popularity');
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it('URL に既にクエリがあるなら書き戻さない', async () => {
      navigateTo({ genre_ids: '28' });
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify({ genre_ids: [12] }),
      );

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      // URL が正。localStorage で上書きしない
      expect(result.current.selectedGenreIds).toEqual([28]);
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it('復元が無ければ書き戻さない', async () => {
      navigateTo({});

      const { result } = renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    // 履歴を積むと「戻る」が空振りして同じページに留まる
    it('書き戻しは replace で行う（push しない）', async () => {
      navigateTo({});
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify({ genre_ids: [28] }),
      );

      renderHook(() => useMovieList(defaultOptions), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalled();
      });
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    describe('saved_filters からの復元', () => {
      beforeEach(() => {
        mockSessionStatus = 'authenticated';
        mockSessionData = { user: { id: 'user-123', name: 'テストユーザー' } };
      });

      it('絞り込みがあればURLへ書き戻す', async () => {
        navigateTo({});
        mockGetSavedFilter.mockResolvedValue({ genre_ids: [28] });

        const { result } = renderHook(() => useMovieList(defaultOptions), {
          wrapper: createQueryWrapper(),
        });

        await waitFor(() => {
          expect(result.current.selectedGenreIds).toEqual([28]);
        });
        await waitFor(() => {
          expect(mockRouterReplace).toHaveBeenCalled();
        });
        expect(replacedSearch()).toContain('genre_ids=28');
      });

      /**
       * ⚠️ saved_filters だけは `validateFilterConditions` を通らない
       * （サーバーの JSONB をそのまま返す）ため、空配列が残りうる。
       *
       * ゲートは素通りするが URL は変わらないので実害は無い。重要なのは
       * **その場合もガードを下ろすこと**。下ろさないと着地イベントが来ず、
       * URL追従 effect がそのマウントの間ずっと死ぬ（#1051 が再発する）
       */
      it('空配列だけの保存では戻る操作を取りこぼさない', async () => {
        navigateTo({});
        mockGetSavedFilter.mockResolvedValue({ genre_ids: [] });

        const { result, rerender } = renderHook(
          () => useMovieList(defaultOptions),
          { wrapper: createQueryWrapper() },
        );

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        // 「戻る」でクエリ付きのURLへ移動したら、追従すること
        navigateTo({ genre_ids: '99' });
        rerender();

        expect(result.current.selectedGenreIds).toEqual([99]);
      });
    });
  });
});
