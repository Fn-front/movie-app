/**
 * useMovieFilterフックのテスト
 */

import { renderHook, act } from '@testing-library/react';
import { useSearchParams, useRouter } from 'next/navigation';

import { useMovieFilter } from './useMovieFilter';

// --- Mocks ---
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

// --- Helpers ---
const mockPush = jest.fn();

function createSearchParams(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

function setupMocks(params: Record<string, string> = {}) {
  const searchParams = createSearchParams(params);
  mockUseSearchParams.mockReturnValue(
    searchParams as unknown as ReturnType<typeof useSearchParams>,
  );
  mockUseRouter.mockReturnValue({ push: mockPush } as unknown as ReturnType<
    typeof useRouter
  >);
}

describe('useMovieFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('URLパラメータからのフィルター読み取り', () => {
    it('ジャンルパラメータを読み取る', () => {
      setupMocks({ genre: '28,12' });

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.currentFilters.genre).toEqual([28, 12]);
    });

    it('年代パラメータを読み取る', () => {
      setupMocks({ year: '2024' });

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.currentFilters.year).toBe(2024);
    });

    it('評価パラメータを読み取る', () => {
      setupMocks({ vote_average_gte: '7.5' });

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.currentFilters.vote_average_gte).toBe(7.5);
    });

    it('パラメータがない場合はundefinedを返す', () => {
      setupMocks({});

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.currentFilters.genre).toBeUndefined();
      expect(result.current.currentFilters.year).toBeUndefined();
      expect(result.current.currentFilters.vote_average_gte).toBeUndefined();
    });
  });

  describe('hasActiveFilters', () => {
    it('フィルターがない場合はfalse', () => {
      setupMocks({});

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('ジャンルフィルターがある場合はtrue', () => {
      setupMocks({ genre: '28' });

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('年代フィルターがある場合はtrue', () => {
      setupMocks({ year: '2024' });

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('評価フィルターがある場合はtrue', () => {
      setupMocks({ vote_average_gte: '7' });

      const { result } = renderHook(() => useMovieFilter());

      expect(result.current.hasActiveFilters).toBe(true);
    });
  });

  describe('handleFilterChange', () => {
    it('フィルター変更でURLを更新する', () => {
      setupMocks({ query: 'テスト' });

      const { result } = renderHook(() => useMovieFilter());

      act(() => {
        result.current.handleFilterChange({ genre: [28, 12], year: 2024 });
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('genre=28%2C12'),
      );
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('year=2024'),
      );
    });

    it('ページパラメータをリセットする', () => {
      setupMocks({ query: 'テスト', page: '3' });

      const { result } = renderHook(() => useMovieFilter());

      act(() => {
        result.current.handleFilterChange({ genre: [28] });
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.not.stringContaining('page='),
      );
    });

    it('既存のqueryパラメータを保持する', () => {
      setupMocks({ query: 'テスト' });

      const { result } = renderHook(() => useMovieFilter());

      act(() => {
        result.current.handleFilterChange({ year: 2024 });
      });

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('query='));
    });

    it('vote_average_gteフィルターでURLを更新する', () => {
      setupMocks({ query: 'テスト' });

      const { result } = renderHook(() => useMovieFilter());

      act(() => {
        result.current.handleFilterChange({ vote_average_gte: 7.5 });
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('vote_average_gte=7.5'),
      );
    });

    it('undefinedのフィルターを削除する', () => {
      setupMocks({ query: 'テスト', genre: '28' });

      const { result } = renderHook(() => useMovieFilter());

      act(() => {
        result.current.handleFilterChange({ genre: undefined });
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.not.stringContaining('genre='),
      );
    });
  });

  describe('handleFilterClear', () => {
    it('すべてのフィルターパラメータを削除する', () => {
      setupMocks({
        query: 'テスト',
        genre: '28',
        year: '2024',
        vote_average_gte: '7',
        page: '2',
      });

      const { result } = renderHook(() => useMovieFilter());

      act(() => {
        result.current.handleFilterClear();
      });

      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('genre=');
      expect(calledUrl).not.toContain('year=');
      expect(calledUrl).not.toContain('vote_average_gte=');
      expect(calledUrl).not.toContain('page=');
    });

    it('queryパラメータは保持する', () => {
      setupMocks({ query: 'テスト', genre: '28' });

      const { result } = renderHook(() => useMovieFilter());

      act(() => {
        result.current.handleFilterClear();
      });

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('query='));
    });
  });
});
