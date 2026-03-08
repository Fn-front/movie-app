/**
 * useMovieDetailフック テスト
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useMovieDetail } from './useMovieDetail';

// --- Mocks ---

const mockGetMovieDetail = jest.fn();

jest.mock('@/lib/api/movies/movies', () => ({
  getMovieDetail: (...args: unknown[]) => mockGetMovieDetail(...args),
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

// --- Tests ---

describe('useMovieDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('movieIdがnullの場合クエリを実行しない', () => {
    const { result } = renderHook(() => useMovieDetail(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.movie).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(mockGetMovieDetail).not.toHaveBeenCalled();
  });

  it('映画詳細を取得する', async () => {
    const mockMovie = {
      id: 123,
      title: 'テスト映画',
      runtime: 120,
      genres: [{ id: 28, name: 'アクション' }],
    };
    mockGetMovieDetail.mockResolvedValue({ data: mockMovie });

    const { result } = renderHook(() => useMovieDetail(123), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.movie).toEqual(mockMovie);
    });

    expect(mockGetMovieDetail).toHaveBeenCalledWith(123);
    expect(result.current.isError).toBe(false);
  });

  it('エラー時にisErrorがtrueになる', async () => {
    mockGetMovieDetail.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useMovieDetail(123), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.movie).toBeUndefined();
  });
});
