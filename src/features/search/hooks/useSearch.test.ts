/**
 * useSearchフックのテスト
 */

import { renderHook, act } from '@testing-library/react';
import { useSearchParams, useRouter } from 'next/navigation';

import { useToast } from '@/hooks/useToast';
import { useSearch } from './useSearch';

// --- Mocks ---
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/lib/api/search/search', () => ({
  searchMoviesApi: jest.fn(),
}));
jest.mock('@/hooks/useToast');

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(),
    keepPreviousData: actual.keepPreviousData,
  };
});

import { useQuery } from '@tanstack/react-query';

const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

// --- Helpers ---
const mockPush = jest.fn();
const mockToast = jest.fn();

function createSearchParams(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

function setupMocks(
  params: Record<string, string> = {},
  queryResult: Partial<ReturnType<typeof useQuery>> = {},
) {
  const searchParams = createSearchParams(params);
  mockUseSearchParams.mockReturnValue(
    searchParams as unknown as ReturnType<typeof useSearchParams>,
  );
  mockUseRouter.mockReturnValue({ push: mockPush } as unknown as ReturnType<
    typeof useRouter
  >);
  mockUseToast.mockReturnValue({
    toast: mockToast,
    toasts: [],
    removeToast: jest.fn(),
    clearToasts: jest.fn(),
  });

  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...queryResult,
  } as unknown as ReturnType<typeof useQuery>);
}

describe('useSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('URLパラメータの読み取り', () => {
    it('queryパラメータを読み取る', () => {
      setupMocks({ query: 'テスト映画' });

      const { result } = renderHook(() => useSearch());

      expect(result.current.query).toBe('テスト映画');
    });

    it('queryパラメータがない場合は空文字を返す', () => {
      setupMocks({});

      const { result } = renderHook(() => useSearch());

      expect(result.current.query).toBe('');
    });
  });

  describe('検索結果の取得', () => {
    it('検索結果データを正しく返す', () => {
      const mockData = {
        success: true as const,
        data: {
          movies: [
            {
              id: 1,
              title: 'テスト映画',
              original_title: 'Test',
              overview: '概要',
              poster_path: '/test.jpg',
              backdrop_path: null,
              release_date: '2024-01-01',
              vote_average: 7.5,
              vote_count: 100,
              popularity: 50,
              genre_ids: [28],
              adult: false,
              original_language: 'ja',
            },
          ],
          pagination: {
            page: 1,
            totalPages: 5,
            totalResults: 100,
            isServerFiltered: false,
          },
        },
      };

      setupMocks({ query: 'テスト' }, { data: mockData });

      const { result } = renderHook(() => useSearch());

      expect(result.current.movies).toHaveLength(1);
      expect(result.current.movies[0].title).toBe('テスト映画');
      expect(result.current.totalResults).toBe(100);
      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalPages).toBe(5);
    });

    it('ローディング中はisLoadingがtrue', () => {
      setupMocks({ query: 'テスト' }, { isLoading: true });

      const { result } = renderHook(() => useSearch());

      expect(result.current.isLoading).toBe(true);
    });

    it('データがない場合はデフォルト値を返す', () => {
      setupMocks({ query: 'テスト' }, { data: undefined });

      const { result } = renderHook(() => useSearch());

      expect(result.current.movies).toEqual([]);
      expect(result.current.totalResults).toBe(0);
      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalPages).toBe(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('エラー時にトーストを表示する', () => {
      setupMocks(
        { query: 'テスト' },
        { isError: true, error: new Error('エラー') },
      );

      renderHook(() => useSearch());

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  describe('ページ変更', () => {
    it('handlePageChangeでURLを更新する', () => {
      setupMocks({ query: 'テスト' });

      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.handlePageChange(3);
      });

      expect(mockPush).toHaveBeenCalledWith(
        '/search?query=%E3%83%86%E3%82%B9%E3%83%88&page=3',
      );
    });

    it('既存のパラメータを保持してページを更新する', () => {
      setupMocks({ query: 'テスト', genre: '28' });

      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.handlePageChange(2);
      });

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('query='));
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('genre=28'),
      );
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('page=2'));
    });
  });
});
