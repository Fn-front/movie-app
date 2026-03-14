/**
 * TMDb Popular API から人気映画を取得し trending_movies テーブルに同期する
 */

import { createClient } from '@supabase/supabase-js';

import { TRENDING_DISPLAY_COUNT } from '@/constants/trending';
import { getMovieReleaseDates, getPopularMovies } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

/** 劇場公開のリリースタイプ（2: Theatrical limited, 3: Theatrical） */
const THEATRICAL_RELEASE_TYPES = [2, 3];

/** リリースタイプ判定対象の国コード（日本公開のみ） */
const RELEASE_DATE_REGION = 'JP';

/** Popular API の最大取得ページ数 */
const MAX_PAGES = 5;

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
 * JP リージョンで劇場公開（type 2 or 3）のリリースがあればtrue
 */
async function isTheatricalRelease(movieId: number): Promise<boolean> {
  try {
    const releaseDates = await getMovieReleaseDates(movieId);

    const jpRelease = releaseDates.find(
      (country) => country.iso_3166_1 === RELEASE_DATE_REGION,
    );
    if (!jpRelease) return false;

    return jpRelease.release_dates.some((rd) =>
      THEATRICAL_RELEASE_TYPES.includes(rd.type),
    );
  } catch {
    // リリース日取得に失敗した場合は除外しない（安全側に倒す）
    return true;
  }
}

/**
 * Popular API から JP 劇場公開作品を必要件数集める
 *
 * 複数ページを順次取得し、JP劇場公開フィルターを通過した作品が
 * 必要件数に達するか、最大ページ数に到達したら終了する。
 */
async function collectTheatricalMovies(): Promise<{
  movies: Movie[];
  totalFetched: number;
}> {
  const collected: Movie[] = [];
  let totalFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await getPopularMovies(page);

    if (response.results.length === 0) break;

    totalFetched += response.results.length;

    const results = await Promise.all(
      response.results.map(async (movie) => ({
        movie,
        isTheatrical: await isTheatricalRelease(movie.id),
      })),
    );

    for (const r of results) {
      if (r.isTheatrical) {
        collected.push(r.movie);
        if (collected.length >= TRENDING_DISPLAY_COUNT) {
          return { movies: collected, totalFetched };
        }
      }
    }
  }

  return { movies: collected, totalFetched };
}

/**
 * TMDb Popular API から人気映画を取得し trending_movies テーブルに同期する
 *
 * RPC関数（sync_trending_movies）でトランザクション内のDELETE → INSERTをアトミックに実行。
 * 日本で劇場公開（JPでtype 2 or 3）の作品のみにフィルタリングし、最大10件を保存。
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

  // 1. TMDb Popular API から JP 劇場公開作品を収集（失敗時は既存データを保持）
  const { movies, totalFetched } = await collectTheatricalMovies();

  if (movies.length === 0) {
    return { fetched: totalFetched, synced: 0 };
  }

  // 2. RPC関数でトランザクション内の全件洗い替え（DELETE → INSERT）をアトミックに実行
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
    fetched: totalFetched,
    synced: movies.length,
  };
}
