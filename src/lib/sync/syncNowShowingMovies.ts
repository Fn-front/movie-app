/**
 * TMDb Discover API から日本で劇場公開中の人気映画を取得し now_showing_movies テーブルに同期する
 */

import { createClient } from '@supabase/supabase-js';

import {
  RELEASE_TYPE_MAP,
  NOW_SHOWING_RELEASE_DATE_RANGE_MONTHS,
} from '@/constants/movies';
import { NOW_SHOWING_DISPLAY_COUNT } from '@/constants/nowShowing';
import { TMDB_SORT_BY } from '@/constants/tmdb';
import { discoverMovies } from '@/lib/tmdb/tmdb';

/**
 * 同期結果の型
 */
export interface NowShowingSyncResult {
  /** 取得した映画数 */
  fetched: number;
  /** DB に保存した映画数 */
  synced: number;
}

/**
 * YYYY-MM-DD 形式の日付文字列を返す
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * TMDb Discover API から日本で劇場公開中の人気映画を取得し now_showing_movies テーブルに同期する
 *
 * RPC関数（sync_now_showing_movies）でトランザクション内のDELETE → INSERTをアトミックに実行。
 * Discover API の with_release_type=2|3 で劇場公開作品のみを取得し、最大10件を保存。
 * TMDb API 取得に失敗した場合は既存データを保持する。
 *
 * @returns 同期結果
 */
export async function syncNowShowingMovies(): Promise<NowShowingSyncResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. TMDb Discover API から日本で劇場公開中の人気映画を取得
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setMonth(
    rangeStart.getMonth() - NOW_SHOWING_RELEASE_DATE_RANGE_MONTHS,
  );

  const response = await discoverMovies({
    sort_by: TMDB_SORT_BY.POPULARITY_DESC,
    with_release_type: RELEASE_TYPE_MAP.theatrical,
    'release_date.gte': formatDate(rangeStart),
    'release_date.lte': formatDate(now),
  });

  if (response.results.length === 0) {
    return { fetched: 0, synced: 0 };
  }

  const movies = response.results.slice(0, NOW_SHOWING_DISPLAY_COUNT);

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

  const { error } = await supabase.rpc('sync_now_showing_movies', {
    movies: rows,
  });

  if (error) {
    throw new Error(
      `劇場公開中の人気映画の同期に失敗しました: ${error.message}`,
    );
  }

  return {
    fetched: response.results.length,
    synced: movies.length,
  };
}
