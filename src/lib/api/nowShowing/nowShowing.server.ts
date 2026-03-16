/**
 * 劇場公開中の人気映画API（サーバーサイド用）
 */

import { unstable_cache } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { NowShowingMovie } from '@/lib/types';

/**
 * 劇場公開中の人気映画一覧をDBから取得する（キャッシュなし内部実装）
 */
async function fetchNowShowingMovies(): Promise<NowShowingMovie[]> {
  const supabase = await createClient();

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
