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

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

jest.mock('@/lib/api/search/search', () => ({
  searchMoviesApi: jest.fn(),
}));
jest.mock('@/hooks/useToast');
jest.mock('./useTitleSuggestion', () => ({
  useTitleSuggestion: jest.fn(() => ({ suggestions: [], isLoading: false })),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(),
    keepPreviousData: actual.keepPreviousData,
  };
});

import { useQuery } from '@tanstack/react-query';
import { useTitleSuggestion } from './useTitleSuggestion';

const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUseTitleSuggestion = useTitleSuggestion as jest.MockedFunction<
  typeof useTitleSuggestion
>;

/** useTitleSuggestionに渡されたenabled（最後の呼び出し） */
function lastSuggestionEnabled(): boolean | undefined {
  const calls = mockUseTitleSuggestion.mock.calls;
  return calls[calls.length - 1]?.[1];
}

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
    isFetching: false,
    isPlaceholderData: false,
    isError: false,
    error: null,
    ...queryResult,
  } as unknown as ReturnType<typeof useQuery>);
}

/** 検索結果0件のレスポンス */
const emptyResult = {
  success: true as const,
  data: {
    movies: [],
    pagination: {
      page: 1,
      totalPages: 0,
      totalResults: 0,
      isServerFiltered: false,
    },
  },
};

describe('useSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
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

  describe('原題提案の有効化判定', () => {
    it('検索結果が確定して0件の場合は提案APIを有効化する', () => {
      setupMocks({ query: '存在しない映画' }, { data: emptyResult });

      renderHook(() => useSearch());

      expect(mockUseTitleSuggestion).toHaveBeenCalledWith(
        '存在しない映画',
        true,
      );
    });

    it('前クエリの結果が表示されている間（isPlaceholderData）は提案APIを有効化しない', () => {
      // 0件だったキーワードAの結果を保持したまま、キーワードBを検索し始めた状態
      setupMocks(
        { query: 'ヒットするキーワード' },
        { data: emptyResult, isFetching: true, isPlaceholderData: true },
      );

      renderHook(() => useSearch());

      expect(lastSuggestionEnabled()).toBe(false);
    });

    it('再取得中（isFetching）は提案APIを有効化しない', () => {
      setupMocks(
        { query: 'テスト' },
        { data: emptyResult, isFetching: true, isPlaceholderData: false },
      );

      renderHook(() => useSearch());

      expect(lastSuggestionEnabled()).toBe(false);
    });

    it('初回ローディング中（isLoading）は提案APIを有効化しない', () => {
      setupMocks(
        { query: 'テスト' },
        { data: undefined, isLoading: true, isFetching: true },
      );

      renderHook(() => useSearch());

      expect(lastSuggestionEnabled()).toBe(false);
    });

    it('検索結果がある場合は提案APIを有効化しない', () => {
      const hitResult = {
        success: true as const,
        data: {
          movies: [{ id: 1, title: 'テスト映画' }],
          pagination: {
            page: 1,
            totalPages: 1,
            totalResults: 1,
            isServerFiltered: false,
          },
        },
      };
      setupMocks({ query: 'テスト' }, { data: hitResult });

      renderHook(() => useSearch());

      expect(lastSuggestionEnabled()).toBe(false);
    });

    it('検索条件がない場合は提案APIを有効化しない', () => {
      setupMocks({});

      renderHook(() => useSearch());

      expect(lastSuggestionEnabled()).toBe(false);
    });
  });
});
