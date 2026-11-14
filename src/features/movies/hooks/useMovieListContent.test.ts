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
  const mockHandleFilterModalOpen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('タブ切り替え', () => {
    it('handleTabValueChangeがhandleReleaseTypeChangeを呼ぶ', () => {
      const { result } = renderHook(() =>
        useMovieListContent(
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
          mockHandleFilterModalOpen,
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
          mockHandleFilterModalOpen,
        ),
      );

      act(() => {
        result.current.handleFilterModalOpenChange(false);
      });

      expect(mockHandleFilterModalClose).toHaveBeenCalled();
    });

    /*
      進むで履歴エントリが復活すると Modal から true が来る（#1053）。
      握りつぶすとエントリだけ戻ってモーダルは閉じたままになり、
      次の戻るが空振りする
    */
    it('handleFilterModalOpenChange(true)でhandleFilterModalOpenが呼ばれる', () => {
      const { result } = renderHook(() =>
        useMovieListContent(
          mockHandleReleaseTypeChange,
          mockHandleFilterModalClose,
          mockHandleFilterModalOpen,
        ),
      );

      act(() => {
        result.current.handleFilterModalOpenChange(true);
      });

      expect(mockHandleFilterModalOpen).toHaveBeenCalled();
      expect(mockHandleFilterModalClose).not.toHaveBeenCalled();
    });
  });
});
