/**
 * 映画API（サーバーサイド用）
 */

import { unstable_cache } from 'next/cache';

import { MOVIE_DETAIL_REVALIDATE_SECONDS } from '@/constants';
import { getMovieDetail } from '@/lib/tmdb/tmdb';
import type { MovieDetail } from '@/lib/types';

/**
 * 映画詳細を取得する（Next.jsのデータキャッシュ付き）
 *
 * `/movies/[id]` の `generateMetadata` とページ本体の存在判定から呼ばれる。
 * どちらも同じ映画を見るため、キャッシュを共有して TMDb へのリクエストを
 * 1回に抑える。
 *
 * 画面の中身はクライアントが `/api/movies/[id]` から取り直す（お気に入りの
 * 状態がユーザーごとに変わるため）。ここで取るのは**誰が見ても同じ情報**だけ。
 *
 * 引数は自動的にキャッシュキーへ含まれる。例外はキャッシュされないため、
 * TMDbの一時障害が24時間固定されることはない。
 *
 * ※ Next.js 16 では `use cache` が後継だが、Cache Components（next.config.mjs）が
 *    未有効のため、既存の `person.server.ts` と同じく `unstable_cache` を使う。
 */
export const getCachedMovieDetail: (movieId: number) => Promise<MovieDetail> =
  unstable_cache(
    (movieId: number) => getMovieDetail(movieId),
    ['movie-detail'],
    { revalidate: MOVIE_DETAIL_REVALIDATE_SECONDS },
  );
