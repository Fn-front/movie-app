/**
 * useCalendarフック テスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useCalendar } from './useCalendar';

// --- Mocks ---

const mockGetCalendarMovies = jest.fn();

jest.mock('@/lib/api/calendar/calendar', () => ({
  getCalendarMovies: (...args: unknown[]) => mockGetCalendarMovies(...args),
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

const mockCalendarResponse = {
  success: true,
  data: {
    month: '2026-03',
    movies_by_date: {
      '2026-03-15': [
        {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: '/a.jpg',
          release_date: '2026-03-15',
          added_at: '2026-01-10T00:00:00Z',
        },
        {
          id: 'wl-2',
          tmdb_movie_id: 200,
          title: '映画B',
          poster_path: '/b.jpg',
          release_date: '2026-03-15',
          added_at: '2026-01-09T00:00:00Z',
        },
      ],
      '2026-03-20': [
        {
          id: 'wl-3',
          tmdb_movie_id: 300,
          title: '映画C',
          poster_path: '/c.jpg',
          release_date: '2026-03-20',
          added_at: '2026-01-08T00:00:00Z',
        },
      ],
    },
  },
};

const emptyCalendarResponse = {
  success: true,
  data: {
    month: '2026-04',
    movies_by_date: {},
  },
};

// --- Tests ---

describe('useCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCalendarMovies.mockResolvedValue(mockCalendarResponse);
  });

  it('初期状態で当月を表示する', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    const now = new Date();
    expect(result.current.currentMonth.getFullYear()).toBe(now.getFullYear());
    expect(result.current.currentMonth.getMonth()).toBe(now.getMonth());
    expect(result.current.selectedDate).toBeUndefined();
  });

  it('APIからカレンダーデータを取得できる', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetCalendarMovies).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.current.moviesByDate)).toHaveLength(2);
  });

  it('前月に切り替えできる', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialMonth = result.current.currentMonth.getMonth();

    act(() => {
      result.current.goToPreviousMonth();
    });

    const expectedMonth = initialMonth === 0 ? 11 : initialMonth - 1;
    expect(result.current.currentMonth.getMonth()).toBe(expectedMonth);
  });

  it('次月に切り替えできる', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialMonth = result.current.currentMonth.getMonth();

    act(() => {
      result.current.goToNextMonth();
    });

    const expectedMonth = initialMonth === 11 ? 0 : initialMonth + 1;
    expect(result.current.currentMonth.getMonth()).toBe(expectedMonth);
  });

  it('日付選択で該当映画リストを取得できる', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectDate(new Date(2026, 2, 15)); // 2026-03-15
    });

    expect(result.current.selectedDate).toBeDefined();
    expect(result.current.selectedDateMovies).toHaveLength(2);
    expect(result.current.selectedDateMovies[0].title).toBe('映画A');
  });

  it('映画がない日付を選択すると空配列を返す', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectDate(new Date(2026, 2, 10)); // 映画なし
    });

    expect(result.current.selectedDateMovies).toHaveLength(0);
  });

  it('月切り替え時に選択日がリセットされる', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectDate(new Date(2026, 2, 15));
    });

    expect(result.current.selectedDate).toBeDefined();

    act(() => {
      result.current.goToNextMonth();
    });

    expect(result.current.selectedDate).toBeUndefined();
  });

  it('映画がある日付の一覧を返す', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.datesWithMovies).toHaveLength(2);
  });

  it('月変更時にAPIを呼び出す', async () => {
    mockGetCalendarMovies
      .mockResolvedValueOnce(mockCalendarResponse)
      .mockResolvedValueOnce(emptyCalendarResponse);

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetCalendarMovies).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.goToNextMonth();
    });

    await waitFor(() => {
      expect(mockGetCalendarMovies).toHaveBeenCalledTimes(2);
    });
  });

  it('キャッシュ済みの月への再切り替え時はAPI呼び出しなし', async () => {
    mockGetCalendarMovies
      .mockResolvedValueOnce(mockCalendarResponse)
      .mockResolvedValueOnce(emptyCalendarResponse);

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 次月へ
    act(() => {
      result.current.goToNextMonth();
    });

    await waitFor(() => {
      expect(mockGetCalendarMovies).toHaveBeenCalledTimes(2);
    });

    // 前月（元の月）に戻る → staleTime: Infinity なのでAPI呼び出しなし
    act(() => {
      result.current.goToPreviousMonth();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetCalendarMovies).toHaveBeenCalledTimes(2);
  });

  it('resetCacheでキャッシュクリアされ再取得される', async () => {
    mockGetCalendarMovies.mockResolvedValue(mockCalendarResponse);

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetCalendarMovies).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.resetCache();
    });

    await waitFor(() => {
      expect(mockGetCalendarMovies).toHaveBeenCalledTimes(2);
    });
  });

  it('エラー時にerrorを返す', async () => {
    mockGetCalendarMovies.mockRejectedValueOnce(new Error('API Error'));

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error?.message).toBe('API Error');
  });

  it('ローディング状態が正しく遷移する', async () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
