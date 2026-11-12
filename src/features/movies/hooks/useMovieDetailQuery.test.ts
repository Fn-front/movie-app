/**
 * useMovieDetailQuery のテスト
 *
 * モーダルの開閉をURLクエリで持つ（#1033）。リロードで復元でき、
 * 戻るで閉じられることがこのフックの存在理由なので、
 * 「push で開く」「back で閉じる」を固定する。
 */

import { renderHook, act } from '@testing-library/react';

import { useMovieDetailQuery } from './useMovieDetailQuery';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearch = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  usePathname: () => '/movies/now-showing',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

describe('useMovieDetailQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = '';
  });

  describe('選択中の映画', () => {
    it('movie_id が無ければ null', () => {
      const { result } = renderHook(() => useMovieDetailQuery());

      expect(result.current.selectedMovieId).toBeNull();
    });

    it('movie_id を数値として読む', () => {
      mockSearch = 'movie_id=550';

      const { result } = renderHook(() => useMovieDetailQuery());

      expect(result.current.selectedMovieId).toBe(550);
    });

    // URLは利用者が直接書き換えられる。詳細APIへ不正な値を渡さない
    it.each([
      ['非数値', 'movie_id=abc'],
      ['指数表記', 'movie_id=1e3'],
      ['ゼロ', 'movie_id=0'],
      ['空', 'movie_id='],
    ])('%s は null として扱う', (_label, search) => {
      mockSearch = search;

      const { result } = renderHook(() => useMovieDetailQuery());

      expect(result.current.selectedMovieId).toBeNull();
    });
  });

  describe('開く', () => {
    // replace にすると戻るで閉じられなくなる
    it('push で movie_id を足す', () => {
      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(550));

      expect(mockPush).toHaveBeenCalledWith(
        '/movies/now-showing?movie_id=550',
        {
          scroll: false,
        },
      );
    });

    it('既存のクエリ（フィルター）を保つ', () => {
      mockSearch = 'sort_by=popularity&release_type=theatrical';

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(550));

      const [url] = mockPush.mock.calls[0];
      const params = new URLSearchParams(String(url).split('?')[1]);
      expect(params.get('sort_by')).toBe('popularity');
      expect(params.get('release_type')).toBe('theatrical');
      expect(params.get('movie_id')).toBe('550');
    });

    // 先頭へ跳ぶと、一覧のどこを見ていたか分からなくなる
    it('スクロール位置を動かさない', () => {
      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(550));

      expect(mockPush).toHaveBeenCalledWith(expect.any(String), {
        scroll: false,
      });
    });

    it('別の映画を開くと movie_id を差し替える', () => {
      mockSearch = 'movie_id=550';

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(680));

      expect(mockPush).toHaveBeenCalledWith(
        '/movies/now-showing?movie_id=680',
        {
          scroll: false,
        },
      );
    });
  });

  describe('閉じる', () => {
    // push した1つ分をちょうど戻す。replace で消すと進むで開き直せない
    it('1つ前の履歴へ戻る', () => {
      mockSearch = 'movie_id=550';

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.closeMovieDetail());

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
