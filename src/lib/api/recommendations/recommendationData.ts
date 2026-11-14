/**
 * レコメンドデータの取得（DB アクセスのみ）
 *
 * ⚠️ **この中で `auth()` を呼ばないこと。** cookie を読むとルートが動的になる。
 * ホーム（`/`）を静的プリレンダに保つため、認証は呼び出し側（API ルートの
 * `withAuth`）が済ませてから `userId` を渡す（#1115）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Recommendation } from '@/schema/recommendations';

/**
 * レコメンドデータの型
 */
export interface RecommendationData {
  recommendations: Recommendation[];
  generatedAt: string | null;
  hasFavorites: boolean;
}

/** レコメンドが無い（または取得できない）ときに返す空のデータ */
export const EMPTY_RECOMMENDATION_DATA: RecommendationData = {
  recommendations: [],
  generatedAt: null,
  hasFavorites: false,
};

/**
 * 指定ユーザーのレコメンドデータを取得する
 *
 * 興味なしにした作品は結果から除く。お気に入りが0件の利用者には
 * レコメンドそのものが生成されないため、件数の有無も併せて返す
 * （セクションの文言を出し分けるのに要る）。
 *
 * @param supabase - service role クライアント
 * @param userId - 対象ユーザーのID
 * @returns レコメンドデータ。取得に失敗したときは空のデータ
 */
export async function fetchRecommendationData(
  supabase: SupabaseClient,
  userId: string,
): Promise<RecommendationData> {
  const [recsResult, favCountResult, dismissedResult] = await Promise.all([
    supabase
      .from('recommendations')
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, vote_average, vote_count, genre_ids, reason, display_order, generated_at',
      )
      .eq('user_id', userId)
      .order('display_order', { ascending: true }),
    supabase
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null),
    supabase
      .from('dismissed_movies')
      .select('tmdb_movie_id')
      .eq('user_id', userId)
      .is('deleted_at', null),
  ]);

  if (recsResult.error) {
    // ルートの例外ログ（`Recommendations fetch error`）と接頭辞を分ける。
    // 同じ文言だと「DBエラーで空返却」と「例外で500」をログから区別できない
    console.error('Recommendations query error:', recsResult.error);
    return EMPTY_RECOMMENDATION_DATA;
  }

  const dismissedIds = new Set(
    (dismissedResult.data ?? []).map((d) => d.tmdb_movie_id as number),
  );
  const rows = (recsResult.data ?? []).filter(
    (row) => !dismissedIds.has(row.tmdb_movie_id as number),
  );
  const hasFavorites = (favCountResult.count ?? 0) > 0;
  const generatedAt = rows.length > 0 ? (rows[0].generated_at as string) : null;

  const recommendations: Recommendation[] = rows.map((row) => ({
    id: row.id as string,
    tmdb_movie_id: row.tmdb_movie_id as number,
    title: row.title as string,
    poster_path: row.poster_path as string | null,
    release_date: row.release_date as string | null,
    vote_average: row.vote_average as number | null,
    vote_count: row.vote_count as number,
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
