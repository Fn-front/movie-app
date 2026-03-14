/**
 * 劇場公開中の人気映画API クライアント
 */

import { createClient } from '@/lib/supabase/client';
import type { NowShowingMovie } from '@/lib/types';

/**
 * 劇場公開中の人気映画一覧をDBから取得する
 *
 * @returns 映画一覧（display_order順）
 */
export async function getNowShowingMovies(): Promise<NowShowingMovie[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('now_showing_movies')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
