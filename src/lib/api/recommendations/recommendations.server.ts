/**
 * レコメンドデータ取得（サーバーサイド用）
 */

import { auth } from '@/lib/auth/auth';
import { createClient } from '@/lib/supabase/server';
import type { Recommendation } from '@/schema/recommendations';

/**
 * サーバーサイドで返却するレコメンドデータの型
 */
export interface RecommendationData {
  recommendations: Recommendation[];
  generatedAt: string | null;
  hasFavorites: boolean;
}

/**
 * 認証済みユーザーのレコメンドデータを取得する（Server Component用）
 *
 * 未ログイン時は空のデータを返す。
 *
 * @returns レコメンドデータ
 */
export async function getRecommendations(): Promise<RecommendationData> {
  const emptyData: RecommendationData = {
    recommendations: [],
    generatedAt: null,
    hasFavorites: false,
  };

  const session = await auth();
  if (!session?.user?.id) {
    return emptyData;
  }

  const supabase = await createClient();

  const [recsResult, favCountResult] = await Promise.all([
    supabase
      .from('recommendations')
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, vote_average, genre_ids, reason, display_order, generated_at',
      )
      .eq('user_id', session.user.id)
      .order('display_order', { ascending: true }),
    supabase
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .is('deleted_at', null),
  ]);

  if (recsResult.error) {
    console.error('Recommendations fetch error:', recsResult.error);
    return emptyData;
  }

  const rows = recsResult.data ?? [];
  const hasFavorites = (favCountResult.count ?? 0) > 0;
  const generatedAt =
    rows.length > 0 ? (rows[0].generated_at as string) : null;

  const recommendations: Recommendation[] = rows.map((row) => ({
    id: row.id as string,
    tmdb_movie_id: row.tmdb_movie_id as number,
    title: row.title as string,
    poster_path: row.poster_path as string | null,
    release_date: row.release_date as string | null,
    vote_average: row.vote_average as number | null,
    genre_ids: row.genre_ids as number[] | null,
    reason: row.reason as string,
    display_order: row.display_order as number,
  }));

  return {
    recommendations,
    generatedAt,
    hasFavorites,
  };
}
