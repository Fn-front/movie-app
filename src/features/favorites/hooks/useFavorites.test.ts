/**
 * useFavoritesフック テスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useFavorites } from './useFavorites';
import { movieKeys } from '@/constants';

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
});
