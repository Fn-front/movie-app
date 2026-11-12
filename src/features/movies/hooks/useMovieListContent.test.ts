/**
 * useMovieListContentカスタムフックのテスト
 *
 * 映画詳細の選択状態は `/movies/[id]` のルートへ移ったため、このフックは
 * タブとフィルターモーダルの配線だけを持つ（#1033）。
 */

import { renderHook, act } from '@testing-library/react';

import { useMovieListContent } from './useMovieListContent';

describe('useMovieListContent', () => {
  const mockHandleReleaseTypeChange = jest.fn();
  const mockHandleFilterModalClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('タブ切り替え', () => {
    it('handleTabValueChangeがhandleReleaseTypeChangeを呼ぶ', () => {
      const { result } = renderHook(() =>
        useMovieListContent(
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
