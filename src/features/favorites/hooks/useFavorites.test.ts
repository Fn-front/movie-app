/**
 * useFavoritesフック テスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';
import { AxiosError, AxiosHeaders } from 'axios';

import { useFavorites } from './useFavorites';
import { favoriteKeys, movieKeys, FAVORITES_ERROR_MESSAGES } from '@/constants';

// --- Mocks ---

const mockGetFavorites = jest.fn();
const mockAddFavorite = jest.fn();
const mockUpdateFavoriteRating = jest.fn();
const mockRemoveFavorite = jest.fn();

jest.mock('@/lib/api/favorites/favorites', () => ({
  getFavorites: (...args: unknown[]) => mockGetFavorites(...args),
  addFavorite: (...args: unknown[]) => mockAddFavorite(...args),
  updateFavoriteRating: (...args: unknown[]) =>
    mockUpdateFavoriteRating(...args),
  removeFavorite: (...args: unknown[]) => mockRemoveFavorite(...args),
}));

import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn().mockReturnValue({
    data: { user: { id: 'user-123' } },
    status: 'authenticated',
  }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
  useToastDispatch: () => ({ toast: mockToast }),
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

const mockFavoritesResponse = {
  success: true,
  data: {
    favorites: [
      {
        id: 'fav-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
        rating: 8,
        added_at: '2026-01-10T00:00:00Z',
      },
    ],
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalItems: 1,
      itemsPerPage: 20,
      hasNextPage: false,
      nextPage: null,
    },
  },
};

// --- Tests ---

describe('useFavorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFavorites.mockResolvedValue(mockFavoritesResponse);
  });

  it('お気に入り一覧を取得する', async () => {
    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.favorites).toHaveLength(1);
    });

    expect(result.current.favorites[0].title).toBe('映画A');
  });

  it('追加mutationがAPIを呼び出す', async () => {
    mockAddFavorite.mockResolvedValue({
      success: true,
      message: 'お気に入りに追加しました',
      data: {
        id: 'fav-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: null,
        release_date: null,
        rating: 7,
        added_at: '2026-03-10T00:00:00Z',
      },
    });

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.addToFavorites({
        tmdb_movie_id: 200,
        title: '映画B',
        rating: 7,
      });
    });

    await waitFor(() => {
      expect(mockAddFavorite).toHaveBeenCalled();
      expect(mockAddFavorite.mock.calls[0][0]).toEqual({
        tmdb_movie_id: 200,
        title: '映画B',
        rating: 7,
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
    });
  });

  it('追加エラー時にトーストが表示される', async () => {
    mockAddFavorite.mockRejectedValue(new Error('Conflict'));

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.addToFavorites({
        tmdb_movie_id: 200,
        title: '映画B',
        rating: 7,
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('評価更新mutationがAPIを呼び出す', async () => {
    mockUpdateFavoriteRating.mockResolvedValue({
      success: true,
      message: '評価を更新しました',
      data: {
        id: 'fav-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
        rating: 9,
        added_at: '2026-01-10T00:00:00Z',
      },
    });

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.updateRating('fav-1', 9);
    });

    await waitFor(() => {
      expect(mockUpdateFavoriteRating).toHaveBeenCalled();
    });
  });

  it('評価更新エラー時にトーストが表示される', async () => {
    mockUpdateFavoriteRating.mockRejectedValue(new Error('Not Found'));

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.updateRating('fav-1', 9);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('削除mutationがAPIを呼び出す', async () => {
    mockRemoveFavorite.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.removeFromFavorites('fav-1');
    });

    await waitFor(() => {
      expect(mockRemoveFavorite).toHaveBeenCalled();
    });
  });

  it('削除エラー時にトーストが表示される', async () => {
    mockRemoveFavorite.mockRejectedValue(new Error('Not Found'));

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.removeFromFavorites('fav-1');
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  describe('映画詳細キャッシュとの共存（regression）', () => {
    // movieKeys.all = ['movies'] は ['movies', 'detail', id] にもマッチするため、
    // setQueriesData の updater が詳細キャッシュ（pages を持たない構造）にも
    // 適用されて TypeError を起こさないことを確認する

    it('詳細キャッシュ存在下でも addToFavorites が成功する', async () => {
      mockAddFavorite.mockResolvedValue({
        success: true,
        message: 'お気に入りに追加しました',
        data: {
          id: 'fav-x',
          tmdb_movie_id: 999,
          title: '詳細キャッシュ映画',
          poster_path: null,
          release_date: null,
          rating: 7,
          added_at: '2026-03-10T00:00:00Z',
        },
      });

      const { wrapper, queryClient } = createWrapperWithClient();
      // useMovieDetail のキャッシュは { success, data: MovieDetail } 構造
      queryClient.setQueryData(movieKeys.detail(999), {
        success: true,
        data: {
          id: 999,
          title: '詳細キャッシュ映画',
          overview: '...',
          poster_path: null,
          release_date: null,
          favorite: null,
        },
      });

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addToFavorites({
          tmdb_movie_id: 999,
          title: '詳細キャッシュ映画',
          rating: 7,
        });
      });

      // mutationFn が呼ばれていれば onMutate で例外が出ていない証拠
      await waitFor(() => {
        expect(mockAddFavorite).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'success' }),
        );
      });

      // 詳細キャッシュの favorite が実 ID で更新されている
      const detail = queryClient.getQueryData<{
        success: true;
        data: { favorite: { id: string; rating: number } | null };
      }>(movieKeys.detail(999));
      expect(detail?.data.favorite).toEqual({ id: 'fav-x', rating: 7 });
    });

    it('詳細キャッシュの favorite.rating が updateRating で更新される', async () => {
      mockUpdateFavoriteRating.mockResolvedValue({
        success: true,
        message: '評価を更新しました',
        data: {
          id: 'fav-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: '/a.jpg',
          release_date: '2026-01-01',
          rating: 9,
          added_at: '2026-01-10T00:00:00Z',
        },
      });

      const { wrapper, queryClient } = createWrapperWithClient();
      queryClient.setQueryData(movieKeys.detail(100), {
        success: true,
        data: {
          id: 100,
          title: '映画A',
          overview: '...',
          poster_path: '/a.jpg',
          release_date: '2026-01-01',
          favorite: { id: 'fav-1', rating: 5 },
        },
      });

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateRating('fav-1', 9);
      });

      await waitFor(() => {
        expect(mockUpdateFavoriteRating).toHaveBeenCalled();
      });

      const detail = queryClient.getQueryData<{
        success: true;
        data: { favorite: { id: string; rating: number } | null };
      }>(movieKeys.detail(100));
      expect(detail?.data.favorite).toEqual({ id: 'fav-1', rating: 9 });
    });

    it('詳細キャッシュの favorite が removeFromFavorites で null になる', async () => {
      mockRemoveFavorite.mockResolvedValue(undefined);

      const { wrapper, queryClient } = createWrapperWithClient();
      queryClient.setQueryData(movieKeys.detail(100), {
        success: true,
        data: {
          id: 100,
          title: '映画A',
          overview: '...',
          poster_path: '/a.jpg',
          release_date: '2026-01-01',
          favorite: { id: 'fav-1', rating: 5 },
        },
      });

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.removeFromFavorites('fav-1');
      });

      await waitFor(() => {
        expect(mockRemoveFavorite).toHaveBeenCalled();
      });

      const detail = queryClient.getQueryData<{
        success: true;
        data: { favorite: { id: string; rating: number } | null };
      }>(movieKeys.detail(100));
      expect(detail?.data.favorite).toBeNull();
    });
  });

  /**
   * 照会キャッシュ（favoriteKeys.lookup）は一覧とは別キーのため、
   * movieKeys.all の楽観的更新では追従しない。ここを更新しないと
   * 検索結果・受賞作品・ウォッチリストの表示が再取得1往復ぶん遅れる
   */
  describe('お気に入り照会キャッシュの楽観的更新', () => {
    const seedLookup = (
      queryClient: QueryClient,
      favorites: { id: string; tmdb_movie_id: number; rating: number }[],
    ) => {
      queryClient.setQueryData(favoriteKeys.lookup(), {
        success: true,
        data: { favorites },
      });
    };

    const readLookup = (queryClient: QueryClient) =>
      queryClient.getQueryData<{
        success: true;
        data: {
          favorites: { id: string; tmdb_movie_id: number; rating: number }[];
        };
      }>(favoriteKeys.lookup())?.data.favorites;

    it('追加すると照会キャッシュへ実IDで反映される', async () => {
      mockAddFavorite.mockResolvedValue({
        success: true,
        message: 'お気に入りに追加しました',
        data: {
          id: 'fav-new',
          tmdb_movie_id: 300,
          title: '映画C',
          poster_path: null,
          release_date: null,
          rating: 7,
          added_at: '2026-03-10T00:00:00Z',
        },
      });

      const { wrapper, queryClient } = createWrapperWithClient();
      seedLookup(queryClient, []);

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addToFavorites({
          tmdb_movie_id: 300,
          title: '映画C',
          rating: 7,
        });
      });

      await waitFor(() => {
        expect(readLookup(queryClient)).toEqual([
          { id: 'fav-new', tmdb_movie_id: 300, rating: 7 },
        ]);
      });
    });

    it('追加に失敗すると照会キャッシュが元に戻る', async () => {
      mockAddFavorite.mockRejectedValue(new Error('network error'));

      const { wrapper, queryClient } = createWrapperWithClient();
      seedLookup(queryClient, []);

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addToFavorites({
          tmdb_movie_id: 300,
          title: '映画C',
          rating: 7,
        });
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'error' }),
        );
      });
      expect(readLookup(queryClient)).toEqual([]);
    });

    it('評価を更新すると照会キャッシュの評価も変わる', async () => {
      mockUpdateFavoriteRating.mockResolvedValue({
        success: true,
        message: '評価を更新しました',
        data: {
          id: 'fav-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: '/a.jpg',
          release_date: '2026-01-01',
          rating: 9,
          added_at: '2026-01-10T00:00:00Z',
        },
      });

      const { wrapper, queryClient } = createWrapperWithClient();
      seedLookup(queryClient, [{ id: 'fav-1', tmdb_movie_id: 100, rating: 8 }]);

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateRating('fav-1', 9);
      });

      await waitFor(() => {
        expect(readLookup(queryClient)).toEqual([
          { id: 'fav-1', tmdb_movie_id: 100, rating: 9 },
        ]);
      });
    });

    it('評価の更新に失敗すると照会キャッシュが元に戻る', async () => {
      mockUpdateFavoriteRating.mockRejectedValue(new Error('network error'));

      const { wrapper, queryClient } = createWrapperWithClient();
      seedLookup(queryClient, [{ id: 'fav-1', tmdb_movie_id: 100, rating: 8 }]);

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateRating('fav-1', 2);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'error' }),
        );
      });
      expect(readLookup(queryClient)).toEqual([
        { id: 'fav-1', tmdb_movie_id: 100, rating: 8 },
      ]);
    });

    it('削除すると照会キャッシュから消える', async () => {
      mockRemoveFavorite.mockResolvedValue(undefined);

      const { wrapper, queryClient } = createWrapperWithClient();
      seedLookup(queryClient, [
        { id: 'fav-1', tmdb_movie_id: 100, rating: 8 },
        { id: 'fav-2', tmdb_movie_id: 200, rating: 5 },
      ]);

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.removeFromFavorites('fav-1');
      });

      await waitFor(() => {
        expect(readLookup(queryClient)).toEqual([
          { id: 'fav-2', tmdb_movie_id: 200, rating: 5 },
        ]);
      });
    });

    it('削除に失敗すると照会キャッシュが元に戻る', async () => {
      mockRemoveFavorite.mockRejectedValue(new Error('network error'));

      const { wrapper, queryClient } = createWrapperWithClient();
      seedLookup(queryClient, [{ id: 'fav-1', tmdb_movie_id: 100, rating: 8 }]);

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.removeFromFavorites('fav-1');
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'error' }),
        );
      });
      expect(readLookup(queryClient)).toEqual([
        { id: 'fav-1', tmdb_movie_id: 100, rating: 8 },
      ]);
    });

    it('照会キャッシュが未取得でも追加が成功する', async () => {
      mockAddFavorite.mockResolvedValue({
        success: true,
        message: 'お気に入りに追加しました',
        data: {
          id: 'fav-new',
          tmdb_movie_id: 300,
          title: '映画C',
          poster_path: null,
          release_date: null,
          rating: 7,
          added_at: '2026-03-10T00:00:00Z',
        },
      });

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addToFavorites({
          tmdb_movie_id: 300,
          title: '映画C',
          rating: 7,
        });
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'success' }),
        );
      });
      expect(readLookup(queryClient)).toBeUndefined();
    });
  });

  /**
   * 他タブで先に登録された等、クライアントが知り得ない重複では 409 が返る。
   * 汎用の「追加に失敗しました」だけだと原因が伝わらないため文言を分ける
   */
  describe('重複（409）のハンドリング', () => {
    const createConflictError = () => {
      const error = new AxiosError('Request failed with status code 409');
      error.response = {
        status: 409,
        statusText: 'Conflict',
        data: {
          success: false,
          error: { code: 'CONFLICT', message: '既に登録されています' },
        },
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
      return error;
    };

    // 重複は失敗ではなく「すでに望みどおりの状態」。
    // 赤いエラーだと「やり直さなければ」と誤解させる
    it('409なら重複だと分かる警告トーストを出す', async () => {
      mockAddFavorite.mockRejectedValue(createConflictError());

      const { result } = renderHook(() => useFavorites(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addToFavorites({
          tmdb_movie_id: 300,
          title: '映画C',
          rating: 7,
        });
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: FAVORITES_ERROR_MESSAGES.ALREADY_EXISTS,
            variant: 'warning',
          }),
        );
      });
    });

    it('409以外は従来どおり汎用の失敗メッセージを出す', async () => {
      mockAddFavorite.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useFavorites(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addToFavorites({
          tmdb_movie_id: 300,
          title: '映画C',
          rating: 7,
        });
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: FAVORITES_ERROR_MESSAGES.ADD_FAILED,
            variant: 'error',
          }),
        );
      });
    });

    // onSettled の invalidate で照会が取り直され、実際の登録状態に追従する
    it('409でもお気に入りキャッシュが無効化される', async () => {
      mockAddFavorite.mockRejectedValue(createConflictError());

      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addToFavorites({
          tmdb_movie_id: 300,
          title: '映画C',
          rating: 7,
        });
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: favoriteKeys.all,
        });
      });
    });
  });

  it('未認証時はクエリを実行しない', () => {
    (useSession as jest.Mock).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createWrapper(),
    });

    expect(result.current.favorites).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetFavorites).not.toHaveBeenCalled();

    (useSession as jest.Mock).mockReturnValue({
      data: { user: { id: 'user-123' } },
      status: 'authenticated',
    });
  });

  describe('双方向ページング（#972）', () => {
    /** 指定ページのレスポンスを作る（全 totalPages ページあるものとする） */
    const pageResponse = (page: number, totalPages: number) => ({
      success: true,
      data: {
        favorites: [
          {
            id: `fav-p${page}`,
            tmdb_movie_id: 100 + page,
            title: `映画P${page}`,
            poster_path: null,
            release_date: null,
            rating: 5,
            added_at: '2026-01-10T00:00:00Z',
          },
        ],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalPages,
          itemsPerPage: 20,
          hasNextPage: page < totalPages,
          nextPage: page < totalPages ? page + 1 : null,
        },
      },
    });

    it('先頭ページでは前ページが無い', async () => {
      mockGetFavorites.mockResolvedValue(pageResponse(1, 3));

      const { result } = renderHook(() => useFavorites(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasPreviousPage).toBe(false);
    });

    it('maxPages を超えて進むと先頭ページが捨てられ、前ページを取り直せる', async () => {
      // 保持は5ページ。6ページ目を読むと1ページ目が落ちる
      mockGetFavorites.mockImplementation(({ page }: { page?: number }) =>
        Promise.resolve(pageResponse(page ?? 1, 10)),
      );

      const { result } = renderHook(() => useFavorites(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // 6ページ目まで進める
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          result.current.fetchNextPage();
        });
        await waitFor(() =>
          expect(result.current.isFetchingNextPage).toBe(false),
        );
      }

      // 保持は5ページぶんで頭打ち。これが invalidate 時の再取得数の上限になる
      expect(result.current.favorites).toHaveLength(5);
      // 先頭が捨てられたので取り直せる
      expect(result.current.hasPreviousPage).toBe(true);
      expect(result.current.favorites[0].title).toBe('映画P2');
    });

    it('前ページを取り直すと先頭に戻る', async () => {
      mockGetFavorites.mockImplementation(({ page }: { page?: number }) =>
        Promise.resolve(pageResponse(page ?? 1, 10)),
      );

      const { result } = renderHook(() => useFavorites(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      for (let i = 0; i < 5; i++) {
        await act(async () => {
          result.current.fetchNextPage();
        });
        await waitFor(() =>
          expect(result.current.isFetchingNextPage).toBe(false),
        );
      }
      expect(result.current.favorites[0].title).toBe('映画P2');

      await act(async () => {
        result.current.fetchPreviousPage();
      });
      await waitFor(() =>
        expect(result.current.isFetchingPreviousPage).toBe(false),
      );

      // 捨てられていた1ページ目が戻る（＝画面から項目が消えたままにならない）
      expect(result.current.favorites[0].title).toBe('映画P1');
      expect(result.current.favorites).toHaveLength(5);
    });
  });
});
