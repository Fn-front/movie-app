/**
 * 映画詳細モーダルをURLクエリで開閉するフック
 */

'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { MOVIE_DETAIL_QUERY_PARAM } from '@/constants';
import { parsePositiveIntId } from '@/lib/routeId';

/** {@link useMovieDetailQuery} の戻り値 */
export interface UseMovieDetailQueryReturn {
  /** 表示中の映画ID。モーダルを開いていなければ null */
  selectedMovieId: number | null;
  /** モーダルを開く（URLに `movie_id` を足す） */
  openMovieDetail: (movieId: number) => void;
  /** モーダルを閉じる（1つ前の履歴へ戻る） */
  closeMovieDetail: () => void;
}

/**
 * 映画詳細モーダルの開閉を、いま見ているページのURLクエリで持つ
 *
 * 一覧を離れずにモーダルを重ねたいが、状態をコンポーネントに持つと
 * **リロードで消え、戻るでも閉じられない**（#1033 以前の挙動）。URL に
 * 置けばリロードで復元でき、戻る／進むがブラウザ標準の挙動になる。
 *
 * - 開く: `push`。`replace` にすると戻るで閉じられなくなる
 * - 閉じる: `back`。`push` した1つ分をちょうど戻す
 *
 * `scroll: false` を付けるのは、クエリが変わるだけで一覧の位置は
 * 変わらないため。既定のままだと先頭へ跳ぶ。
 *
 * ⚠️ 共有するURLはこのクエリ付きURLではなく `/movies/<id>`（全画面ページ）。
 * 共有ボタンは `MovieDetailContent` が持つ。
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
      const params = new URLSearchParams(searchParams.toString());
      params.set(MOVIE_DETAIL_QUERY_PARAM, String(movieId));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closeMovieDetail = useCallback(() => {
    router.back();
  }, [router]);

  return { selectedMovieId, openMovieDetail, closeMovieDetail };
}
