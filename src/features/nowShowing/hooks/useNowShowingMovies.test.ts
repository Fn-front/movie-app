/**
 * useNowShowingMoviesフック テスト
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useNowShowingMovies } from './useNowShowingMovies';

// --- Mocks ---

const mockGetNowShowingMovies = jest.fn();

jest.mock('@/lib/api/nowShowing/nowShowing', () => ({
  getNowShowingMovies: () => mockGetNowShowingMovies(),
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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

const mockMovies = [
  {
    id: 'uuid-1',
    tmdb_movie_id: 123,
    title: 'Now Showing Movie 1',
    poster_path: '/poster1.jpg',
    release_date: '2026-03-01',
    vote_average: 7.5,
    popularity: 100,
    display_order: 1,
    fetched_at: '2026-03-14T00:00:00Z',
  },
  {
    id: 'uuid-2',
    tmdb_movie_id: 456,
    title: 'Now Showing Movie 2',
    poster_path: '/poster2.jpg',
    release_date: '2026-02-15',
    vote_average: 8.0,
    popularity: 200,
    display_order: 2,
    fetched_at: '2026-03-14T00:00:00Z',
  },
];

// --- Tests ---

describe('useNowShowingMovies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('劇場公開中の人気映画一覧を取得する', async () => {
    mockGetNowShowingMovies.mockResolvedValue(mockMovies);

    const { result } = renderHook(() => useNowShowingMovies(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.nowShowingMovies).toHaveLength(2);
    expect(result.current.nowShowingMovies[0].title).toBe(
      'Now Showing Movie 1',
    );
    expect(result.current.isError).toBe(false);
  });

  it('データ未取得時は空配列を返す', async () => {
    mockGetNowShowingMovies.mockResolvedValue([]);

    const { result } = renderHook(() => useNowShowingMovies(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.nowShowingMovies).toEqual([]);
  });

  it('エラー時はisErrorがtrueになる', async () => {
    mockGetNowShowingMovies.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useNowShowingMovies(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.nowShowingMovies).toEqual([]);
  });
});
