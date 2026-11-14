/**
 * useMovieDetailQuery のテスト
 *
 * モーダルの開閉をURLクエリで持つ（#1033）。リロードで復元でき、
 * 戻るで閉じられることがこのフックの存在理由なので、
 * 「pushState で開く」「back で閉じる」を固定する。
 *
 * ⚠️ **「履歴が無いまま着地すると閉じられない」（#1079）を固定できるのはここだけ。**
 * Playwright は `about:blank` から `goto` するため `history.length === 2` になり、
 * そのケースを再現できない。E2E が見られるのは「外部から来た場合に
 * アプリの外へ出ない」ほうだけ。
 */

import { renderHook, act } from '@testing-library/react';

import { useMovieDetailQuery, useOpenMovieDetail } from './useMovieDetailQuery';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockSearch = '';
/** `useSearchParams()` が呼ばれた回数（レンダー時に読んでいないことの検証用） */
let searchParamsCalls = 0;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  usePathname: () => '/movies/now-showing',
  useSearchParams: () => {
    searchParamsCalls += 1;
    return new URLSearchParams(mockSearch);
  },
}));

/**
 * Next が書いたエントリの形
 *
 * ⚠️ **空オブジェクトで代用してはいけない。** `{}` だと禁じ手の
 * `{...window.history.state, [KEY]: true}` でも結果が同じになり、
 * 「`__NA` を混ぜていないこと」のテストが素通りする。
 * jsdom には Next のパッチが無いので、ここで現実の形を与えるしかない。
 */
const NEXT_ENTRY = {
  __NA: true,
  __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: [], renderedSearch: null },
};

/** 自分が積んだエントリ（目印あり）に見立てる */
const pushedByUs = () => {
  window.history.replaceState({ ...NEXT_ENTRY, __movieDetailQuery: true }, '');
};

/**
 * 現在のURLのクエリを差し替える
 *
 * 「開く」側は `useSearchParams()` ではなく `window.location` を読む
 * （ホームを静的プリレンダに保つため / #1115）。フックのモックだけ動かしても
 * 実装には届かないので、jsdom のURLも一緒に動かす。
 * `history.state` は保つ（目印の有無がテストの主題のため）
 */
const setSearch = (search: string) => {
  mockSearch = search;
  window.history.replaceState(
    window.history.state,
    '',
    search ? `/movies/now-showing?${search}` : '/movies/now-showing',
  );
};

/** 直接着地したエントリ（目印なし）に見立てる */
const landedDirectly = () => {
  window.history.replaceState({ ...NEXT_ENTRY }, '');
};

describe('useMovieDetailQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSearch('');
    // 他のテストが残した history.state を持ち越さない
    landedDirectly();
  });

  describe('選択中の映画', () => {
    it('movie_id が無ければ null', () => {
      const { result } = renderHook(() => useMovieDetailQuery());

      expect(result.current.selectedMovieId).toBeNull();
    });

    it('movie_id を数値として読む', () => {
      setSearch('movie_id=550');

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
    it('pushState で movie_id を足す', () => {
      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(550));

      expect(window.location.search).toBe('?movie_id=550');
      // ルーターは使わない。push だと目印を置けない（#1079）
      expect(mockPush).not.toHaveBeenCalled();
    });

    /**
     * 目印が無いと、閉じるときに「自分が積んだ」と判断できない。
     * ⚠️ `__NA` を混ぜてはいけない。Next のパッチが内部からの呼び出しと
     * 判断して早期 return し、URL が更新されなくなる
     */
    it('自分が積んだ目印を history.state に残す', () => {
      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(550));

      expect(window.history.state).toEqual({ __movieDetailQuery: true });
      expect(window.history.state).not.toHaveProperty('__NA');
    });

    it('既存のクエリ（フィルター）を保つ', () => {
      setSearch('sort_by=popularity&release_type=theatrical');

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(550));

      const params = new URLSearchParams(window.location.search);
      expect(params.get('sort_by')).toBe('popularity');
      expect(params.get('release_type')).toBe('theatrical');
      expect(params.get('movie_id')).toBe('550');
    });

    it('別の映画を開くと movie_id を差し替える', () => {
      setSearch('movie_id=550');

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(680));

      expect(window.location.search).toBe('?movie_id=680');
    });

    /**
     * `router.push` は同一URLを replace に倒していた（`app-router.js:103-110`）。
     * 素の `pushState` にその判定は無いので、同じエントリが2つ並び
     * **× を1回押しても閉じない**（back が同じ `movie_id` に着地する）
     */
    it('開いている作品をもう一度開いても履歴を積まない', () => {
      setSearch('movie_id=550');
      const before = window.history.length;

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.openMovieDetail(550));

      expect(window.history.length).toBe(before);
    });
  });

  describe('閉じる（自分が開いた場合）', () => {
    beforeEach(() => {
      setSearch('movie_id=550');
      pushedByUs();
    });

    // push した1つ分をちょうど戻す。replace で消すと進むで開き直せない
    it('1つ前の履歴へ戻る', () => {
      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.closeMovieDetail());

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  /**
   * 直接着地（#1079）
   *
   * 新しいタブで `/watchlist?movie_id=550` を開くと履歴が1つしか無く、
   * `back()` は何も起きない。`open` は URL から導出しているので、
   * 閉じるボタンも Esc も背景クリックも効かず**モーダルから出られない**。
   * 外部サイトから来た場合は逆に、閉じるとアプリの外へ出てしまう。
   */
  describe('閉じる（直接着地した場合）', () => {
    beforeEach(() => {
      landedDirectly();
    });

    it('戻らずにクエリだけ落とす', () => {
      setSearch('movie_id=550');

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.closeMovieDetail());

      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/movies/now-showing', {
        scroll: false,
      });
    });

    it('他のクエリ（フィルター）は残す', () => {
      setSearch('sort_by=popularity&movie_id=550');

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.closeMovieDetail());

      expect(mockReplace).toHaveBeenCalledWith(
        '/movies/now-showing?sort_by=popularity',
        { scroll: false },
      );
    });

    // 先頭へ跳ぶと、一覧のどこを見ていたか分からなくなる
    it('スクロール位置を動かさない', () => {
      setSearch('movie_id=550');

      const { result } = renderHook(() => useMovieDetailQuery());

      act(() => result.current.closeMovieDetail());

      expect(mockReplace).toHaveBeenCalledWith(expect.any(String), {
        scroll: false,
      });
    });
  });

  /**
   * 「開く」だけのフック（#1115）
   *
   * ルーターのフックで URL を読むと、それを使うコンポーネントを含むページが
   * 静的プリレンダから外れる（missing-suspense-with-csr-bailout）。
   * 一覧タイルはこちらを使い、URL はクリック時に window.location から読む
   */
  describe('useOpenMovieDetail', () => {
    it('クエリを保ったまま開き、目印を残す', () => {
      setSearch('sort_by=popularity');

      const { result } = renderHook(() => useOpenMovieDetail());

      act(() => result.current(550));

      const params = new URLSearchParams(window.location.search);
      expect(params.get('movie_id')).toBe('550');
      expect(params.get('sort_by')).toBe('popularity');
      expect(window.history.state).toEqual({ __movieDetailQuery: true });
      // ルーターは使わない。push だと目印を置けない（#1079）
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('開いている作品をもう一度開いても履歴を積まない', () => {
      setSearch('movie_id=550');
      const before = window.history.length;

      const { result } = renderHook(() => useOpenMovieDetail());

      act(() => result.current(550));

      expect(window.history.length).toBe(before);
    });

    /**
     * ⚠️ URL を**レンダー時に読んでいない**ことを固定する。
     *
     * `useSearchParams()` のモックは呼ばれた回数を数えられるので、
     * フックの描画だけで呼ばれないことを見る。呼ぶようになると
     * ホームが ƒ（動的）に戻る
     */
    it('レンダー時にクエリを読まない', () => {
      setSearch('movie_id=550');
      const callsBefore = searchParamsCalls;

      renderHook(() => useOpenMovieDetail());

      expect(searchParamsCalls).toBe(callsBefore);
    });
  });
});
