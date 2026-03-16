/**
 * 劇場公開中の人気映画API（サーバーサイド用）
 */

import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';

import type { NowShowingMovie } from '@/lib/types';

/**
 * 劇場公開中の人気映画一覧をDBから取得する（キャッシュなし内部実装）
 *
 * unstable_cache内ではcookies()が使えないため、
 * 公開データ取得用にcookies不要のSupabaseクライアントを使用する。
 */
async function fetchNowShowingMovies(): Promise<NowShowingMovie[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not defined');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .from('now_showing_movies')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * 劇場公開中の人気映画一覧をDBから取得する（Server Component用）
 * 1時間キャッシュ（Cronによる日次同期に合わせた頻度）
 *
 * @returns 映画一覧（display_order順）
 */
export const getNowShowingMovies = unstable_cache(
  fetchNowShowingMovies,
  ['now-showing-movies'],
  { revalidate: 3600 },
);
