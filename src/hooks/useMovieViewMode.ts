/**
 * 映画一覧の表示モード（グリッド／リスト）フック
 *
 * スマホではカードが大きく1画面に約2件しか入らないため、1行1件のリスト表示へ
 * 切り替えられるようにする（#1014）。設定は全画面で共通の1つを localStorage に持つ。
 *
 * localStorage（外部状態）を唯一の真実源とし、useSyncExternalStore で購読する
 * （useCookieConsent と同じ作り）。ツールバーのトグルと一覧コンテナは別インスタンス
 * になるため、片方の変更をもう片方へ伝える必要がある。
 */

'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { STORAGE_KEYS } from '@/constants';

/** 映画一覧の表示モード */
export type MovieViewMode = 'grid' | 'list';

/** 既定の表示モード。SSR と初回描画はこれで揃える */
export const DEFAULT_MOVIE_VIEW_MODE: MovieViewMode = 'grid';

/** 表示モードの変更をインスタンス間で同期するためのイベント名 */
export const MOVIE_VIEW_MODE_CHANGE_EVENT = 'movie-app:movie-view-mode-change';

/** useMovieViewMode の返り値 */
export interface UseMovieViewModeReturn {
  viewMode: MovieViewMode;
  setViewMode: (next: MovieViewMode) => void;
}

/**
 * 保存値を読む（SSR安全。未設定・未知値は既定）
 *
 * 返すのは文字列だけにする。オブジェクトを返すと毎回新しい参照になり、
 * useSyncExternalStore の Object.is 比較で常に「変化した」と判定される
 */
function getSnapshot(): MovieViewMode {
  if (typeof window === 'undefined') {
    return DEFAULT_MOVIE_VIEW_MODE;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.MOVIE_VIEW_MODE);
    return value === 'grid' || value === 'list'
      ? value
      : DEFAULT_MOVIE_VIEW_MODE;
  } catch {
    // Cookie 遮断・プライベートモードでは読めないことがある
    return DEFAULT_MOVIE_VIEW_MODE;
  }
}

/**
 * SSR と、ハイドレーション時の初回レンダーで使われる値
 *
 * ⛔ **保存値を返してはいけない。** サーバー出力と食い違って hydration
 * mismatch になる（`useMovieViewMode.test.ts` に回帰テストがある）。
 *
 * ## リスト設定の利用者が1度グリッドを見るか（#1048 で実測）
 *
 * **本番ビルドではどのルートでも見ない。** ただし**理由はルートごとに違う**。
 *
 * | ルート | ハイドレーションされない理由 | `next dev` | `next start` |
 * |---|---|---|---|
 * | `/movies/now-showing` | `page.tsx` の `<Suspense>` ＋ 一覧の `useSearchParams`（CSR bailout） | グリッド相**あり** | 無し |
 * | `/movies/upcoming` `/search` `/awards` `/person/[id]` `/favorites` `/watchlist` | `loader.tsx` の `dynamic(..., { ssr: false })` | 無し | 無し |
 *
 * ⚠️ **ひとまとめに「`useSearchParams` の CSR bailout」と書かない。**
 * 前提が消える条件がルートごとに違うため、取り違えると警告が届かない。
 *
 * ⚠️ **#1048 の「影響範囲: 2画面」も誤り**（レビューで実測）。実際に
 * 起きうるのは `/movies/now-showing` だけ。
 *
 * dev で見えるのは on-demand SSR でハイドレーションされるため。利用者が
 * 触るのは本番ビルドだけなので**直さずに許容し**、退行だけを
 * `e2e/mobile/movieViewModeFlash.spec.ts` で見張っている。
 *
 * ⚠️ 前提が消える条件:
 * - `/movies/now-showing`: PPR / Cache Components の有効化、`force-dynamic`、
 *   一覧から `useSearchParams` を外す、`<Suspense>` を動かす
 * - その他: **loader の `ssr: false` を外す**
 */
function getServerSnapshot(): MovieViewMode {
  return DEFAULT_MOVIE_VIEW_MODE;
}

/**
 * 表示モードの変更を購読する
 *
 * 同一タブはカスタムイベント、別タブは storage イベントで届く
 * （storage は書き込んだタブ自身には発火しないので二重にならない）
 */
function subscribe(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    // key === null は localStorage.clear()
    if (event.key !== null && event.key !== STORAGE_KEYS.MOVIE_VIEW_MODE) {
      return;
    }
    onStoreChange();
  };

  window.addEventListener(MOVIE_VIEW_MODE_CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(MOVIE_VIEW_MODE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * 映画一覧の表示モードを読み書きする。
 *
 * @returns 現在の表示モードと、その変更関数
 */
export function useMovieViewMode(): UseMovieViewModeReturn {
  const viewMode = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setViewMode = useCallback((next: MovieViewMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, next);
    } catch {
      // 書き込めない環境では設定を保持できない。グリッドのまま扱われる
    }

    window.dispatchEvent(new Event(MOVIE_VIEW_MODE_CHANGE_EVENT));
  }, []);

  return { viewMode, setViewMode };
}
