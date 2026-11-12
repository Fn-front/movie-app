/**
 * useShareMovie のテスト
 *
 * 共有するのは**全画面ページの URL**（`/movies/<id>`）。モーダルを開いている
 * ときの URL（`?movie_id=…`）を渡すと、一覧の絞り込みごと共有してしまう（#1033）。
 */

import { renderHook, act } from '@testing-library/react';

import { useShareMovie } from './useShareMovie';

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToastDispatch: () => ({ toast: mockToast }),
}));

const setNavigator = (value: unknown) => {
  Object.defineProperty(window, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
};

const originalNavigator = window.navigator;

describe('useShareMovie', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    setNavigator(originalNavigator);
  });

  describe('navigator.share が使える環境', () => {
    it('全画面ページの絶対URLを共有する', async () => {
      const share = jest.fn().mockResolvedValue(undefined);
      setNavigator({ share });

      const { result } = renderHook(() => useShareMovie());
      await act(() => result.current.shareMovie(550, 'ファイト・クラブ'));

      expect(share).toHaveBeenCalledWith({
        title: 'ファイト・クラブ',
        url: `${window.location.origin}/movies/550`,
      });
    });

    it('共有できたらトーストを出さない（OS側が伝える）', async () => {
      setNavigator({
        share: jest.fn().mockResolvedValue(undefined),
      });

      const { result } = renderHook(() => useShareMovie());
      await act(() => result.current.shareMovie(550, 'ファイト・クラブ'));

      expect(mockToast).not.toHaveBeenCalled();
    });

    // 共有シートを閉じただけで「失敗しました」と出すのは誤報
    it('利用者が共有シートを閉じてもエラーを出さない', async () => {
      const share = jest.fn().mockRejectedValue(new Error('AbortError'));
      const writeText = jest.fn();
      setNavigator({ share, clipboard: { writeText } });

      const { result } = renderHook(() => useShareMovie());
      await act(() => result.current.shareMovie(550, 'ファイト・クラブ'));

      expect(mockToast).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  describe('navigator.share が無い環境（PC のブラウザ等）', () => {
    it('クリップボードへ全画面ページのURLをコピーする', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      setNavigator({ clipboard: { writeText } });

      const { result } = renderHook(() => useShareMovie());
      await act(() => result.current.shareMovie(550, 'ファイト・クラブ'));

      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/movies/550`,
      );
    });

    // コピーは画面に変化が出ないので、伝えないと成功したか分からない
    it('コピーできたらトーストで伝える', async () => {
      setNavigator({
        clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
      });

      const { result } = renderHook(() => useShareMovie());
      await act(() => result.current.shareMovie(550, 'ファイト・クラブ'));

      expect(mockToast).toHaveBeenCalledWith({
        title: 'リンクをコピーしました',
        variant: 'success',
      });
    });

    it('コピーに失敗したらエラーのトーストを出す', async () => {
      setNavigator({
        clipboard: { writeText: jest.fn().mockRejectedValue(new Error('no')) },
      });

      const { result } = renderHook(() => useShareMovie());
      await act(() => result.current.shareMovie(550, 'ファイト・クラブ'));

      expect(mockToast).toHaveBeenCalledWith({
        title: 'リンクをコピーできませんでした',
        variant: 'error',
      });
    });
  });
});
