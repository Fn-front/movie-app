/**
 * 劇場公開中の人気映画API（サーバーサイド用）
 */

import { createClient } from '@/lib/supabase/server';
import type { NowShowingMovie } from '@/lib/types';

/**
 * 劇場公開中の人気映画一覧をDBから取得する（Server Component用）
 *
 * @returns 映画一覧（display_order順）
 */
export async function getNowShowingMovies(): Promise<NowShowingMovie[]> {
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
