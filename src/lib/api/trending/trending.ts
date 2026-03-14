/**
 * トレンド映画API クライアント
 */

import { createClient } from '@/lib/supabase/client';
import type { TrendingMovie } from '@/lib/types';

/**
 * トレンド映画一覧をDBから取得する
 *
 * @returns トレンド映画一覧（display_order順）
 */
export async function getTrendingMovies(): Promise<TrendingMovie[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('trending_movies')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
