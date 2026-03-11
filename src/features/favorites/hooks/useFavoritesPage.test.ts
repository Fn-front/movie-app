/**
 * useFavoritesPageフック テスト
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useFavoritesPage } from './useFavoritesPage';

// --- Mocks ---

const mockGetFavorites = jest.fn();

jest.mock('@/lib/api/favorites/favorites', () => ({
  getFavorites: (...args: unknown[]) => mockGetFavorites(...args),
  addFavorite: jest.fn(),
  updateFavoriteRating: jest.fn(),
  removeFavorite: jest.fn(),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn().mockReturnValue({
    data: { user: { id: 'user-123' } },
    status: 'authenticated',
  }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: jest.fn() }),
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
      {
        id: 'fav-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: null,
        release_date: null,
        rating: 5,
        added_at: '2026-02-15T00:00:00Z',
      },
    ],
    total: 2,
    page: 1,
    limit: 20,
  },
};

// --- Tests ---

describe('useFavoritesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFavorites.mockResolvedValue(mockFavoritesResponse);
  });

  it('お気に入り一覧を取得する', async () => {
    const { result } = renderHook(() => useFavoritesPage(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.favorites).toHaveLength(2);
    });

    expect(result.current.favorites[0].title).toBe('映画A');
    expect(result.current.favorites[1].title).toBe('映画B');
  });

  it('初期ソートはadded_at', () => {
    const { result } = renderHook(() => useFavoritesPage(), {
      wrapper: createWrapper(),
    });

    expect(result.current.sortBy).toBe('added_at');
  });

  it('ソート切替でratingに変更される', async () => {
    const { result } = renderHook(() => useFavoritesPage(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.handleSortChange('rating');
    });

    expect(result.current.sortBy).toBe('rating');

    await waitFor(() => {
      expect(mockGetFavorites).toHaveBeenCalledWith(
        expect.objectContaining({ sort_by: 'rating' }),
      );
    });
  });

  it('ソート切替でadded_atに戻せる', async () => {
    const { result } = renderHook(() => useFavoritesPage(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.handleSortChange('rating');
    });

    act(() => {
      result.current.handleSortChange('added_at');
    });

    expect(result.current.sortBy).toBe('added_at');

    await waitFor(() => {
      expect(mockGetFavorites).toHaveBeenCalledWith(
        expect.objectContaining({ sort_by: 'added_at' }),
      );
    });
  });

  it('favoriteToggleが提供される', () => {
    const { result } = renderHook(() => useFavoritesPage(), {
      wrapper: createWrapper(),
    });

    expect(result.current.favoriteToggle).toBeDefined();
    expect(result.current.favoriteToggle.modalState.isOpen).toBe(false);
    expect(result.current.favoriteToggle.handleFavoriteToggle).toBeDefined();
  });

  it('お気に入りが空の場合は空配列を返す', async () => {
    mockGetFavorites.mockResolvedValue({
      success: true,
      data: { favorites: [], total: 0, page: 1, limit: 20 },
    });

    const { result } = renderHook(() => useFavoritesPage(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.favorites).toEqual([]);
  });
});
