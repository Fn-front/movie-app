/**
 * 映画詳細モーダルをURLクエリで開閉するフック
 */

'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { MOVIE_DETAIL_QUERY_PARAM } from '@/constants';
import { parsePositiveIntId } from '@/lib/routeId';

/**
 * 「このエントリは自分が積んだ」ことの目印（#1079）
 *
 * `history.state` に置く。`useRef` では足りない。ホームは**開く側と
 * 閉じる側が別インスタンス**（`nowShowingMovieList` / `recommendationSection`
 * が開き、`homeMovieDetailModal` が閉じる）なので、コンポーネントに
 * 持たせると共有されない。
 */
const MOVIE_DETAIL_STATE_KEY = '__movieDetailQuery';

/** {@link useMovieDetailQuery} の戻り値 */
export interface UseMovieDetailQueryReturn {
  /** 表示中の映画ID。モーダルを開いていなければ null */
  selectedMovieId: number | null;
  /** モーダルを開く（URLに `movie_id` を足す） */
  openMovieDetail: (movieId: number) => void;
  /** モーダルを閉じる（自分が積んだエントリなら戻る、そうでなければクエリを落とす） */
  closeMovieDetail: () => void;
}

/**
 * 映画詳細モーダルの開閉を、いま見ているページのURLクエリで持つ
 *
 * 一覧を離れずにモーダルを重ねたいが、状態をコンポーネントに持つと
 * **リロードで消え、戻るでも閉じられない**（#1033 以前の挙動）。URL に
 * 置けばリロードで復元でき、戻る／進むがブラウザ標準の挙動になる。
 *
 * ⚠️ 共有するURLはこのクエリ付きURLではなく `/movies/<id>`（全画面ページ）。
 * 共有ボタンは `MovieDetailContent` が持つ。
 *
 * ## 開く: `router.push` ではなく `history.pushState`
 *
 * **URLと「自分が積んだ」目印を1回の同期的な呼び出しで同時に確定させるため**（#1079）。
 *
 * `router.push` だと目印を置けない。Next は push / replace のとき
 * custom history state を捨てる（`app-router.js` の
 * `pushRef.preserveCustomHistoryState` が push/replace 時は false）。
 * push のあとに `replaceState` で書こうとしても、Next の履歴書き込みは
 * `useInsertionEffect` なので**1つ前のエントリに付く**。
 *
 * Next.js 16 は同一ページのクエリ更新に native History API を使うことを
 * 公式にサポートしており、`usePathname` / `useSearchParams` と同期する。
 * パッチされた `pushState` が `__NA` と内部ツリーを**現在のエントリから
 * コピーしてくれる**ので、戻るも通常どおり動く。
 *
 * 目印が消えないのは、この後 Next が `HistoryUpdater` の `useInsertionEffect`
 * で打つ `replaceState` が `{...window.history.state, …}` とスプレッドするから。
 * その経路は `preserveCustomHistoryState` が `true` のとき（traverse と初回描画）
 * を通るので、**リロードして開き直しても目印は生き残る**。
 *
 * ⚠️ 渡す state に `__NA` を**含めてはいけない**。含めるとパッチが
 * 「Next 内部からの呼び出し」と判断して早期 return する（`app-router.js:289`）。
 * `originalPushState` は呼ばれるのでアドレスバーの URL は変わるが、
 * **`applyUrlFromHistoryPushReplace` が走らずルーターが追従しない**ため
 * `useSearchParams` が古いままになり、モーダルが開かない。
 * `{...window.history.state, …}` と書かないこと。`useOverlayHistory` は
 * URL を変えないのでスプレッドしていても問題にならない。
 *
 * ## 閉じる: 自分が積んだときだけ `back`
 *
 * 常に `back()` にすると、**履歴を1つも持たないタブで
 * `/watchlist?movie_id=550` に着地した利用者がモーダルから出られない**（#1079）。
 * `open` は URL から導出しているので、`back()` が no-op なら閉じるボタンも
 * Esc も背景クリックも効かない（WCAG 2.1.2 キーボードトラップ）。
 * 外部サイトから来た場合は逆に、閉じるとアプリの外へ出てしまう。
 *
 * 目印が無いエントリ（＝自分で開いていない）はクエリだけ `replace` で落とす。
 * 一覧からタイルを押して開いた場合は従来どおり戻るで閉じられる。
 */
export function useMovieDetailQuery(): UseMovieDetailQueryReturn {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawMovieId = searchParams.get(MOVIE_DETAIL_QUERY_PARAM);

  const selectedMovieId = useMemo(
    () => (rawMovieId === null ? null : parsePositiveIntId(rawMovieId)),
    [rawMovieId],
  );

  const openMovieDetail = useCallback(
    (movieId: number) => {
      // 同じ作品をもう一度開いても積まない。`router.push` は同一URLのとき
      // replace に倒していたが（`app-router.js:103-110`）、素の pushState には
      // その判定が無いので、同じエントリが2つ並んで戻るが空振りする
      if (searchParams.get(MOVIE_DETAIL_QUERY_PARAM) === String(movieId)) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set(MOVIE_DETAIL_QUERY_PARAM, String(movieId));

      window.history.pushState(
        { [MOVIE_DETAIL_STATE_KEY]: true },
        '',
        `${pathname}?${params.toString()}`,
      );
    },
    [pathname, searchParams],
  );

  const closeMovieDetail = useCallback(() => {
    // 自分が積んだエントリなら、push した1つ分をちょうど戻す。
    // replace で消すと「進む」で開き直せない
    if (window.history.state?.[MOVIE_DETAIL_STATE_KEY]) {
      router.back();
      return;
    }

    // 直接着地したエントリ。戻る先はアプリの外か、そもそも無い。
    // クエリだけ落として、履歴はこれ以上増やさない
    const params = new URLSearchParams(searchParams.toString());
    params.delete(MOVIE_DETAIL_QUERY_PARAM);
    const query = params.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  return { selectedMovieId, openMovieDetail, closeMovieDetail };
}
