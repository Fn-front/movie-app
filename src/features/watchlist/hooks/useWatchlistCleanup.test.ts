/**
 * useWatchlistCleanup カスタムフック テスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useWatchlistCleanup } from './useWatchlistCleanup';

// --- Mocks ---

const mockGetWatchlistWatchedYears = jest.fn();
const mockGetWatchlistWatched = jest.fn();
const mockBulkDeleteWatchlist = jest.fn();

jest.mock('@/lib/api/watchlist/watchlist', () => ({
  getWatchlistWatchedYears: (...args: unknown[]) =>
    mockGetWatchlistWatchedYears(...args),
  getWatchlistWatched: (...args: unknown[]) => mockGetWatchlistWatched(...args),
  bulkDeleteWatchlist: (...args: unknown[]) => mockBulkDeleteWatchlist(...args),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// --- Helpers ---

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

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

const mockItem = (id: string, title: string) => ({
  id,
  tmdb_movie_id: 1,
  title,
  poster_path: null,
  release_date: null,
  added_at: '2024-03-01T00:00:00Z',
  watched_at: '2024-04-01T00:00:00Z',
});

// --- Tests ---

describe('useWatchlistCleanup', () => {
  const onDeleted = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWatchlistWatchedYears.mockResolvedValue({
      success: true,
      data: {
        years: [
          { year: 2025, count: 3, unrated_count: 1 },
          { year: 2024, count: 12, unrated_count: 5 },
        ],
      },
    });
    mockGetWatchlistWatched.mockResolvedValue({
      success: true,
      data: {
        watchlist: [mockItem(UUID_A, '映画A'), mockItem(UUID_B, '映画B')],
        next_cursor: null,
        has_more: false,
      },
    });
    mockBulkDeleteWatchlist.mockResolvedValue({
      success: true,
      message: '12件を削除しました',
      data: { deleted_count: 12 },
    });
  });

  it('年一覧を取得し最新年を初期選択する', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));
    expect(result.current.years).toHaveLength(2);
  });

  it('enabled が false ならクエリを発行しない', () => {
    renderHook(() => useWatchlistCleanup({ enabled: false, onDeleted }), {
      wrapper: createWrapper(),
    });

    expect(mockGetWatchlistWatchedYears).not.toHaveBeenCalled();
  });

  it('初期状態は全選択で、選択件数はその年の総件数と一致する', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));

    expect(result.current.isAllSelected).toBe(true);
    expect(result.current.selectedCount).toBe(3);
  });

  it('チェックを外すと選択件数が減る', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.toggleItem(UUID_A));

    expect(result.current.isSelected(UUID_A)).toBe(false);
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.isAllSelected).toBe(false);
  });

  it('年を切り替えると除外選択がリセットされる', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.toggleItem(UUID_A));
    expect(result.current.isSelected(UUID_A)).toBe(false);

    act(() => result.current.handleYearChange('2024'));

    await waitFor(() => expect(result.current.selectedYear).toBe(2024));
    expect(result.current.isSelected(UUID_A)).toBe(true);
    expect(result.current.selectedCount).toBe(12);
  });

  it('除外したIDを付けて削除APIを呼ぶ', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.toggleItem(UUID_A));
    act(() => result.current.handleDelete());

    // react-query v5 は mutationFn を (variables, context) で呼ぶため、
    // 第1引数だけを見る（既存の useWatchlist.test.ts と同じ流儀）
    await waitFor(() => expect(mockBulkDeleteWatchlist).toHaveBeenCalled());
    expect(mockBulkDeleteWatchlist.mock.calls[0][0]).toEqual({
      year: 2025,
      exclude_ids: [UUID_A],
    });
  });

  it('削除に成功したらトーストを出して onDeleted を呼ぶ', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));
    act(() => result.current.handleDelete());

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: '12件を削除しました' }),
    );
  });

  it('削除に失敗したらエラートーストを出し onDeleted を呼ばない', async () => {
    mockBulkDeleteWatchlist.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));
    act(() => result.current.handleDelete());

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      ),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('すべて選択を押すと除外がリセットされる', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.toggleItem(UUID_A));
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.toggleAll());

    expect(result.current.selectedCount).toBe(3);
    expect(result.current.isAllSelected).toBe(true);
  });

  it('選択中の年のお気に入り未登録件数を返す', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.selectedYear).toBe(2025));
    expect(result.current.unratedCount).toBe(1);

    act(() => result.current.handleYearChange('2024'));

    await waitFor(() => expect(result.current.selectedYear).toBe(2024));
    expect(result.current.unratedCount).toBe(5);
  });

  it('外したチェックをもう一度押すと選択に戻る', async () => {
    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.toggleItem(UUID_A));
    expect(result.current.isSelected(UUID_A)).toBe(false);

    act(() => result.current.toggleItem(UUID_A));

    expect(result.current.isSelected(UUID_A)).toBe(true);
    expect(result.current.selectedCount).toBe(3);
  });

  it('年が未選択なら削除APIを呼ばない', async () => {
    mockGetWatchlistWatchedYears.mockResolvedValue({
      success: true,
      data: { years: [] },
    });

    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isYearsLoading).toBe(false));
    act(() => result.current.handleDelete());

    expect(mockBulkDeleteWatchlist).not.toHaveBeenCalled();
  });

  it('次ページがあるとき fetchNextPage で続きを読み込む', async () => {
    mockGetWatchlistWatched
      .mockResolvedValueOnce({
        success: true,
        data: {
          watchlist: [mockItem(UUID_A, '映画A')],
          next_cursor: '20',
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          watchlist: [mockItem(UUID_B, '映画B')],
          next_cursor: null,
          has_more: false,
        },
      });

    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('視聴済みが1件も無いとき selectedYear は null のまま', async () => {
    mockGetWatchlistWatchedYears.mockResolvedValue({
      success: true,
      data: { years: [] },
    });

    const { result } = renderHook(
      () => useWatchlistCleanup({ enabled: true, onDeleted }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isYearsLoading).toBe(false));
    expect(result.current.selectedYear).toBeNull();
    expect(result.current.years).toEqual([]);
  });
});
