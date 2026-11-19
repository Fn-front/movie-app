/**
 * 映画API（サーバーサイド用）
 */

import { unstable_cache } from 'next/cache';

import {
  API,
  MOVIE_DETAIL_REVALIDATE_SECONDS,
  TMDB_MOVIE_DETAIL_APPEND,
  TMDB_VIDEO_LANGUAGES,
} from '@/constants';
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
 * TMDbの一時障害が24時間固定されることはない（TMDb の 404 も毎回問い合わせる）。
 *
 * ※ Next.js 16 では `use cache` が後継だが、Cache Components（next.config.mjs）が
 *    未有効のため、既存の `person.server.ts` と同じく `unstable_cache` を使う。
 */
export const getCachedMovieDetail: (movieId: number) => Promise<MovieDetail> =
  unstable_cache(
    (movieId: number) => getMovieDetail(movieId),
    // ⚠️ `append_to_response` / `include_video_language` / 言語を**キーに含める**
    // （#1273 のレビュー指摘）。
    //
    // `unstable_cache` のキーは「コールバックの文字列 ＋ keyParts ＋ 引数」で、
    // コールバック本体は `(movieId) => getMovieDetail(movieId)` のまま。
    // つまり **定数の値を変えてもキーは変わらない**。さらにキャッシュは
    // デプロイをまたいで残る（キーに build ID が入らない）ので、
    // append を増やしても最大24時間は新フィールドの欠けた応答が返る。
    [
      'movie-detail',
      TMDB_MOVIE_DETAIL_APPEND,
      TMDB_VIDEO_LANGUAGES,
      API.TMDB_LANGUAGE,
    ],
    { revalidate: MOVIE_DETAIL_REVALIDATE_SECONDS },
  );
