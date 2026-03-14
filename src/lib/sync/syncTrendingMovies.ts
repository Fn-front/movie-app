/**
 * TMDb Trending API（週次）からトレンド映画を取得し trending_movies テーブルに同期する
 */

import { createClient } from '@supabase/supabase-js';

import { TRENDING_DISPLAY_COUNT } from '@/constants/trending';
import { getMovieReleaseDates, getTrendingMovies } from '@/lib/tmdb/tmdb';
import type { TMDbTrendingMovie } from '@/lib/types';

/** 劇場公開のリリースタイプ（2: Theatrical limited, 3: Theatrical） */
const THEATRICAL_RELEASE_TYPES = [2, 3];

/** リリースタイプ判定対象の国コード */
const RELEASE_DATE_REGIONS = ['JP', 'US'];

/**
 * トレンド映画同期結果の型
 */
export interface TrendingSyncResult {
  /** 取得した映画数 */
  fetched: number;
  /** DB に保存した映画数 */
  synced: number;
}

/**
 * 映画が劇場公開作品かどうかを判定する
 *
 * JP または US リージョンで劇場公開（type 2 or 3）のリリースがあればtrue
 */
async function isTheatricalRelease(movieId: number): Promise<boolean> {
  try {
    const releaseDates = await getMovieReleaseDates(movieId);

    return releaseDates.some(
      (country) =>
        RELEASE_DATE_REGIONS.includes(country.iso_3166_1) &&
        country.release_dates.some((rd) =>
          THEATRICAL_RELEASE_TYPES.includes(rd.type),
        ),
    );
  } catch {
    // リリース日取得に失敗した場合は除外しない（安全側に倒す）
    return true;
  }
}

/**
 * トレンド映画を劇場公開作品のみにフィルタリングする
 */
async function filterTheatricalMovies(
  movies: TMDbTrendingMovie[],
): Promise<TMDbTrendingMovie[]> {
  const results = await Promise.all(
    movies.map(async (movie) => ({
      movie,
      isTheatrical: await isTheatricalRelease(movie.id),
    })),
  );

  return results.filter((r) => r.isTheatrical).map((r) => r.movie);
}

/**
 * TMDb Trending API から今週のトレンド映画を取得し trending_movies テーブルに同期する
 *
 * RPC関数（sync_trending_movies）でトランザクション内のDELETE → INSERTをアトミックに実行。
 * 劇場公開作品（JP/USでtype 2 or 3）のみにフィルタリングし、最大10件を保存。
 * TMDb API 取得に失敗した場合は既存データを保持する。
 *
 * @returns 同期結果
 */
export async function syncTrendingMovies(): Promise<TrendingSyncResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. TMDb Trending API からトレンド映画を取得（失敗時は既存データを保持）
  const response = await getTrendingMovies();

  if (response.results.length === 0) {
    return { fetched: 0, synced: 0 };
  }

  // 2. 劇場公開作品のみにフィルタリングし、10件に制限
  const theatricalMovies = await filterTheatricalMovies(response.results);
  const movies = theatricalMovies.slice(0, TRENDING_DISPLAY_COUNT);

  if (movies.length === 0) {
    return { fetched: response.results.length, synced: 0 };
  }

  // 3. RPC関数でトランザクション内の全件洗い替え（DELETE → INSERT）をアトミックに実行
  const rows = movies.map((movie, index) => ({
    tmdb_movie_id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
    release_date: movie.release_date || null,
    vote_average: movie.vote_average,
    popularity: movie.popularity,
    display_order: index + 1,
  }));

  const { error } = await supabase.rpc('sync_trending_movies', {
    movies: rows,
  });

  if (error) {
    throw new Error(`トレンド映画の同期に失敗しました: ${error.message}`);
  }

  return {
    fetched: response.results.length,
    synced: movies.length,
  };
}
