/**
 * useMovieListContentカスタムフックのテスト
 */

import { renderHook, act } from '@testing-library/react';

import type { MovieCacheItem } from '@/lib/api/movies/movies';

import { useMovieListContent } from './useMovieListContent';

const createMockMovie = (
  overrides?: Partial<MovieCacheItem>,
): MovieCacheItem => ({
  id: 1,
  title: 'テスト映画',
  poster_path: '/test.jpg',
  backdrop_path: null,
  release_date: '2026-03-01',
  overview: 'テスト概要',
  vote_average: 7.5,
  popularity: 100,
  genre_ids: [28],
  release_type: 'theatrical',
  is_revival: false,
  ...overrides,
});

describe('useMovieListContent', () => {
  const mockHandleReleaseTypeChange = jest.fn();
  const mockHandleFilterModalClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('映画詳細モーダル', () => {
    it('初期状態ではselectedMovieIdがnull', () => {
      const { result } = renderHook(() =>
        useMovieListContent(
          [],
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      expect(result.current.selectedMovieId).toBeNull();
      expect(result.current.showFinancialInfo).toBe(false);
    });

    it('handleMovieTileClickで映画が選択される', () => {
      const movies = [createMockMovie({ id: 42, release_date: '2020-01-01' })];
      const { result } = renderHook(() =>
        useMovieListContent(
          movies,
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleMovieTileClick(42);
      });

      expect(result.current.selectedMovieId).toBe(42);
      expect(result.current.showFinancialInfo).toBe(true);
    });

    it('未公開映画ではshowFinancialInfoがfalse', () => {
      const movies = [createMockMovie({ id: 1, release_date: '2099-12-31' })];
      const { result } = renderHook(() =>
        useMovieListContent(
          movies,
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleMovieTileClick(1);
      });

      expect(result.current.showFinancialInfo).toBe(false);
    });

    it('リバイバル映画ではshowFinancialInfoがtrue', () => {
      const movies = [
        createMockMovie({
          id: 1,
          release_date: '2099-12-31',
          is_revival: true,
        }),
      ];
      const { result } = renderHook(() =>
        useMovieListContent(
          movies,
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleMovieTileClick(1);
      });

      expect(result.current.showFinancialInfo).toBe(true);
    });

    it('release_dateがnullの場合showFinancialInfoがfalse', () => {
      const movies = [
        createMockMovie({
          id: 1,
          release_date: null as unknown as string,
          is_revival: false,
        }),
      ];
      const { result } = renderHook(() =>
        useMovieListContent(
          movies,
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleMovieTileClick(1);
      });

      expect(result.current.showFinancialInfo).toBe(false);
    });

    it('handleDetailModalCloseで状態がリセットされる', () => {
      const movies = [createMockMovie({ id: 42, release_date: '2020-01-01' })];
      const { result } = renderHook(() =>
        useMovieListContent(
          movies,
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleMovieTileClick(42);
      });
      expect(result.current.selectedMovieId).toBe(42);

      act(() => {
        result.current.handleDetailModalClose();
      });
      expect(result.current.selectedMovieId).toBeNull();
      expect(result.current.showFinancialInfo).toBe(false);
    });

    it('selectedMovieTitleが正しく返される', () => {
      const movies = [createMockMovie({ id: 42, title: 'テスト映画A' })];
      const { result } = renderHook(() =>
        useMovieListContent(
          movies,
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleMovieTileClick(42);
      });

      expect(result.current.selectedMovieTitle).toBe('テスト映画A');
    });
  });

  describe('タブ切り替え', () => {
    it('handleTabValueChangeがhandleReleaseTypeChangeを呼ぶ', () => {
      const { result } = renderHook(() =>
        useMovieListContent(
          [],
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleTabValueChange('streaming');
      });

      expect(mockHandleReleaseTypeChange).toHaveBeenCalledWith('streaming');
    });
  });

  describe('フィルターモーダル', () => {
    it('handleFilterModalOpenChange(false)でhandleFilterModalCloseが呼ばれる', () => {
      const { result } = renderHook(() =>
        useMovieListContent(
          [],
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleFilterModalOpenChange(false);
      });

      expect(mockHandleFilterModalClose).toHaveBeenCalled();
    });

    it('handleFilterModalOpenChange(true)ではhandleFilterModalCloseが呼ばれない', () => {
      const { result } = renderHook(() =>
        useMovieListContent(
          [],
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
        ),
      );

      act(() => {
        result.current.handleFilterModalOpenChange(true);
      });

      expect(mockHandleFilterModalClose).not.toHaveBeenCalled();
    });
  });
});
