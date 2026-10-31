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
  useSession: jest.fn(() => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  })),
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
import { useSession } from 'next-auth/react';
import { TITLE_SUGGESTION } from '@/constants';
import { useTitleSuggestion } from './useTitleSuggestion';

const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockUseTitleSuggestion = useTitleSuggestion as jest.MockedFunction<
  typeof useTitleSuggestion
>;

/** useTitleSuggestionに渡されたenabled（最後の呼び出し） */
function lastSuggestionEnabled(): boolean | undefined {
  const calls = mockUseTitleSuggestion.mock.calls;
  return calls[calls.length - 1]?.[1];
}

/** 未認証状態にする */
function setUnauthenticated(): void {
  mockUseSession.mockReturnValue({
    data: null,
    status: 'unauthenticated',
  } as unknown as ReturnType<typeof useSession>);
}

/** 原題提案APIが候補を返した状態にする */
function setApiSuggestions(suggestions: string[]): void {
  mockUseTitleSuggestion.mockReturnValue({ suggestions, isLoading: false });
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

/** 検索結果ありのレスポンス */
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

describe('useSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    // clearAllMocks は mockReturnValue を戻さないため、既定値を明示的に敷き直す
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    } as unknown as ReturnType<typeof useSession>);
    mockUseTitleSuggestion.mockReturnValue({
      suggestions: [],
      isLoading: false,
    });
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

  describe('提案クリックからの引き継ぎ（sessionStorage）', () => {
    /** 提案をクリックして遷移した状態を作る */
    function storeSuggestionFor(query: string, suggestions: string[]): void {
      sessionStorage.setItem(
        TITLE_SUGGESTION.STORAGE_KEY,
        JSON.stringify({ query, suggestions }),
      );
    }

    /** sessionStorageに生の文字列を仕込む（旧形式・壊れた値の再現用） */
    function storeRaw(value: string): void {
      sessionStorage.setItem(TITLE_SUGGESTION.STORAGE_KEY, value);
    }

    it('提案クリック直後の遷移先では残りの候補を引き継ぎ、提案APIを呼ばない', () => {
      storeSuggestionFor('Gojira', ['Gojira', 'Godzilla']);
      setupMocks({ query: 'Gojira' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      // クリック済みの'Gojira'は押しても同じURLなので選択肢から外す（#887）
      expect(result.current.suggestions).toEqual(['Godzilla']);
      expect(lastSuggestionEnabled()).toBe(false);
      // 引き継ぎ対象なので保存値は残す（リロードしても候補が消えない）
      expect(
        sessionStorage.getItem(TITLE_SUGGESTION.STORAGE_KEY),
      ).not.toBeNull();
    });

    it('クリック済みの候補しか無い場合は候補を表示しない', () => {
      storeSuggestionFor('Gojira', ['Gojira']);
      setupMocks({ query: 'Gojira' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
    });

    it('クリック済みを除いて0件になっても提案APIは呼ばない', () => {
      // 除外後の件数で判定するとAIを呼び直してしまう（#824のコスト抑制が崩れる）
      storeSuggestionFor('Gojira', ['Gojira']);
      setupMocks({ query: 'Gojira' }, { data: emptyResult });

      renderHook(() => useSearch());

      expect(lastSuggestionEnabled()).toBe(false);
    });

    it('遷移先がヒットした場合もクリック済みの候補は表示しない', () => {
      storeSuggestionFor('Gojira', ['Gojira', 'Godzilla']);
      setupMocks({ query: 'Gojira' }, { data: hitResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual(['Godzilla']);
      expect(result.current.movies).toHaveLength(1);
    });

    it('別キーワードで0件になったら候補を表示せず、提案APIを有効化する', () => {
      storeSuggestionFor('Gojira', ['Gojira', 'Godzilla']);
      setupMocks({ query: '別のキーワード' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
      expect(lastSuggestionEnabled()).toBe(true);
    });

    it('別キーワードへ移ったら保存値を取り除く', () => {
      storeSuggestionFor('Gojira', ['Gojira']);
      setupMocks({ query: '別のキーワード' }, { data: emptyResult });

      renderHook(() => useSearch());

      expect(sessionStorage.getItem(TITLE_SUGGESTION.STORAGE_KEY)).toBeNull();
    });

    it('別キーワードがヒットした場合も無関係な候補を表示しない', () => {
      storeSuggestionFor('Gojira', ['Gojira']);
      setupMocks({ query: 'バットマン' }, { data: hitResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.movies).toHaveLength(1);
    });

    it('クエリ無し（ジャンルのみ）で0件になっても前回の候補を表示しない', () => {
      storeSuggestionFor('Gojira', ['Gojira']);
      setupMocks({ genre: '28' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
      expect(sessionStorage.getItem(TITLE_SUGGESTION.STORAGE_KEY)).toBeNull();
    });

    it('旧形式（裸の配列）は不正値として取り除き、提案APIを有効化する', () => {
      storeRaw(JSON.stringify(['Gojira', 'Godzilla']));
      setupMocks({ query: 'Gojira' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
      expect(lastSuggestionEnabled()).toBe(true);
      expect(sessionStorage.getItem(TITLE_SUGGESTION.STORAGE_KEY)).toBeNull();
    });

    it('壊れた値は不正値として取り除き、提案APIを有効化する', () => {
      storeRaw('{壊れたJSON');
      setupMocks({ query: 'Gojira' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
      expect(lastSuggestionEnabled()).toBe(true);
      expect(sessionStorage.getItem(TITLE_SUGGESTION.STORAGE_KEY)).toBeNull();
    });

    it('API提案がある場合は引き継ぎ分より優先する', () => {
      storeSuggestionFor('Gojira', ['Gojira']);
      setApiSuggestions(['Godzilla Minus One']);
      setupMocks({ query: '別のキーワード' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual(['Godzilla Minus One']);
    });

    it('提案APIが失敗して候補ゼロでも、検索結果は正常に返る', () => {
      setApiSuggestions([]);
      setupMocks({ query: 'バットマン' }, { data: hitResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.movies).toHaveLength(1);
      expect(result.current.isError).toBe(false);
    });

    it('未認証では引き継いだ候補を表示せず、提案APIも呼ばない', () => {
      storeSuggestionFor('Gojira', ['Gojira', 'Godzilla']);
      setUnauthenticated();
      setupMocks({ query: 'Gojira' }, { data: emptyResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.suggestions).toEqual([]);
      expect(lastSuggestionEnabled()).toBe(false);
    });

    it('sessionStorageが使えない環境でも落ちずに検索できる', () => {
      const getItemSpy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('SecurityError');
        });
      setupMocks({ query: 'バットマン' }, { data: hitResult });

      const { result } = renderHook(() => useSearch());

      expect(result.current.movies).toHaveLength(1);
      expect(result.current.suggestions).toEqual([]);
      getItemSpy.mockRestore();
    });
  });
});
