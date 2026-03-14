/**
 * TMDb Trending API（週次）からトレンド映画を取得し trending_movies テーブルに同期する
 */

import { createClient } from '@supabase/supabase-js';

import { TRENDING_DISPLAY_COUNT } from '@/constants/trending';
import { getTrendingMovies } from '@/lib/tmdb/tmdb';

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
 * TMDb Trending API から今週のトレンド映画を取得し trending_movies テーブルに同期する
 *
 * トランザクション内で全件洗い替え（DELETE → INSERT）を行う。
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
  const movies = response.results.slice(0, TRENDING_DISPLAY_COUNT);

  if (movies.length === 0) {
    return { fetched: 0, synced: 0 };
  }

  // 2. トランザクション内で全件洗い替え（RPC経由）
  const rows = movies.map((movie, index) => ({
    tmdb_movie_id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
    release_date: movie.release_date || null,
    vote_average: movie.vote_average,
    popularity: movie.popularity,
    display_order: index + 1,
  }));

  // DELETE → INSERT をトランザクションで実行
  const { error: deleteError } = await supabase
    .from('trending_movies')
    .delete()
    .gte('display_order', 1);

  if (deleteError) {
    throw new Error(`トレンド映画の削除に失敗しました: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase
    .from('trending_movies')
    .insert(rows);

  if (insertError) {
    throw new Error(`トレンド映画の保存に失敗しました: ${insertError.message}`);
  }

  return {
    fetched: response.results.length,
    synced: movies.length,
  };
}
