/**
 * レコメンド生成サービス
 * CRONルートから分離したビジネスロジック
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_MAX_RETRIES,
  RECOMMENDATIONS_GENERATION_BUFFER,
  RECOMMENDATIONS_ACTIVE_USER_DAYS,
  RECOMMENDATIONS_BATCH_SIZE,
  CRON_ERROR_MESSAGES,
} from '@/constants';
import {
  fetchRecommendationsFromOpenAI,
  resolveRecommendationsWithTMDb,
  type FavoriteMovie,
  type ExcludedMovie,
  type DismissedMovie,
  type ResolvedRecommendation,
} from '@/lib/openai/generateRecommendations';

/** ユーザー単位の処理結果 */
interface UserProcessResult {
  status: 'processed' | 'skipped';
  recommendationCount: number;
}

/** 全体の処理サマリー */
export interface GenerateRecommendationsSummary {
  processed_users: number;
  skipped_users: number;
  inactive_users: number;
  total_recommendations: number;
}

/** Discriminated Union: 成功結果 */
interface FetchActiveUserIdsSuccess {
  type: 'success';
  activeUserIds: string[];
  inactiveUsers: number;
}

/** Discriminated Union: エラー結果 */
interface FetchActiveUserIdsError {
  type: 'error';
  error: string;
}

type FetchActiveUserIdsResult =
  | FetchActiveUserIdsSuccess
  | FetchActiveUserIdsError;

/** Discriminated Union: CRON成功結果 */
interface CronSuccess {
  type: 'success';
  data: GenerateRecommendationsSummary;
}

/** Discriminated Union: CRONエラー結果 */
interface CronError {
  type: 'error';
  error: string;
}

export type CronResult = CronSuccess | CronError;

/**
 * お気に入りが1件以上あるアクティブユーザーIDを取得
 */
export async function fetchActiveUserIds(
  supabase: SupabaseClient,
): Promise<FetchActiveUserIdsResult> {
  const { data: favoriteRows, error: usersError } = await supabase
    .from('favorites')
    .select('user_id')
    .is('deleted_at', null);

  const usersWithFavorites = favoriteRows
    ? [...new Set(favoriteRows.map((f) => f.user_id as string))]
    : null;

  if (usersError || !usersWithFavorites) {
    console.error('Failed to fetch users with favorites:', usersError);
    return { type: 'error', error: CRON_ERROR_MESSAGES.FETCH_USERS_FAILED };
  }

  const activeThreshold = new Date();
  activeThreshold.setDate(
    activeThreshold.getDate() - RECOMMENDATIONS_ACTIVE_USER_DAYS,
  );

  const { data: activeUsers, error: activeUsersError } = await supabase
    .from('users')
    .select('id')
    .in('id', usersWithFavorites)
    .gte('last_login_at', activeThreshold.toISOString());

  if (activeUsersError) {
    console.error('Failed to fetch active users:', activeUsersError);
    return {
      type: 'error',
      error: CRON_ERROR_MESSAGES.FETCH_ACTIVE_USERS_FAILED,
    };
  }

  const activeUserIds = activeUsers
    ? activeUsers.map((u) => u.id as string)
    : [];

  const inactiveUsers = usersWithFavorites.length - activeUserIds.length;

  return { type: 'success', activeUserIds, inactiveUsers };
}

/**
 * ユーザーのお気に入り・ウォッチリスト・除外リストを収集
 */
export async function collectUserMovieData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  favoriteMovies: FavoriteMovie[];
  excludedTitles: string[];
  baseExcludedIds: Set<number>;
  dismissedMovies: DismissedMovie[];
} | null> {
  const { data: favorites, error: favError } = await supabase
    .from('favorites')
    .select('tmdb_movie_id, title, rating')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (favError || !favorites || favorites.length === 0) {
    return null;
  }

  const favoriteMovies: FavoriteMovie[] = favorites.map((f) => ({
    title: f.title,
    rating: f.rating,
  }));

  const { data: watchlistItems } = await supabase
    .from('watchlist')
    .select('tmdb_movie_id, title')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const { data: dismissedItems } = await supabase
    .from('dismissed_movies')
    .select('tmdb_movie_id, title, genre_ids')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const dismissedMovies = (dismissedItems || []) as DismissedMovie[];

  const excludedMovies: ExcludedMovie[] = [
    ...favorites.map((f) => ({
      tmdb_movie_id: f.tmdb_movie_id,
      title: f.title,
    })),
    ...(watchlistItems || []).map((w) => ({
      tmdb_movie_id: w.tmdb_movie_id,
      title: w.title,
    })),
    ...dismissedMovies.map((d) => ({
      tmdb_movie_id: d.tmdb_movie_id,
      title: d.title,
    })),
  ];

  const excludedTitles = excludedMovies.map((m) => m.title);
  const baseExcludedIds = new Set(excludedMovies.map((m) => m.tmdb_movie_id));

  return { favoriteMovies, excludedTitles, baseExcludedIds, dismissedMovies };
}

/**
 * AIレコメンド生成（リトライロジック含む）
 */
export async function generateRecommendationsWithRetry(
  favoriteMovies: FavoriteMovie[],
  excludedTitles: string[],
  baseExcludedIds: Set<number>,
  dismissedMovies: DismissedMovie[],
): Promise<ResolvedRecommendation[]> {
  const allResolved: ResolvedRecommendation[] = [];
  let remainingCount = RECOMMENDATIONS_MAX_COUNT;
  let retryExcludedTitles = [...excludedTitles];
  let retryExcludedIds = baseExcludedIds;

  for (let attempt = 0; attempt <= RECOMMENDATIONS_MAX_RETRIES; attempt++) {
    // TMDb解決時の取りこぼし・除外を見越し、必要数より多め（+バッファ）に要求する
    const requestCount = remainingCount + RECOMMENDATIONS_GENERATION_BUFFER;
    const aiRecommendations = await fetchRecommendationsFromOpenAI(
      favoriteMovies,
      retryExcludedTitles,
      requestCount,
      dismissedMovies,
    );

    if (!aiRecommendations) {
      break;
    }

    const resolvedInAttempt = await resolveRecommendationsWithTMDb(
      aiRecommendations,
      retryExcludedIds,
      remainingCount,
    );

    for (const item of resolvedInAttempt) {
      // バッファ分多めに解決されても最大件数で丸める（オーバーシュート防止）
      if (allResolved.length >= RECOMMENDATIONS_MAX_COUNT) {
        break;
      }
      if (allResolved.some((r) => r.tmdb_movie_id === item.tmdb_movie_id)) {
        continue;
      }
      allResolved.push({
        ...item,
        display_order: allResolved.length + 1,
      });
    }

    remainingCount = RECOMMENDATIONS_MAX_COUNT - allResolved.length;
    if (remainingCount <= 0) {
      break;
    }

    retryExcludedIds = new Set([
      ...baseExcludedIds,
      ...allResolved.map((r) => r.tmdb_movie_id),
    ]);
    retryExcludedTitles = [
      ...excludedTitles,
      ...allResolved.map((r) => r.title),
    ];
  }

  return allResolved;
}

/**
 * DBトランザクション（既存退避 → 削除 → 新規挿入、失敗時復元）
 */
export async function upsertRecommendations(
  supabase: SupabaseClient,
  userId: string,
  resolved: ResolvedRecommendation[],
): Promise<boolean> {
  const { data: existingRecs } = await supabase
    .from('recommendations')
    .select('*')
    .eq('user_id', userId);

  const { error: deleteError } = await supabase
    .from('recommendations')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    console.error(
      `Failed to delete old recommendations for user ${userId}:`,
      deleteError,
    );
    return false;
  }

  const insertData = resolved.map((r) => ({
    user_id: userId,
    tmdb_movie_id: r.tmdb_movie_id,
    title: r.title,
    poster_path: r.poster_path,
    release_date: r.release_date,
    vote_average: r.vote_average,
    genre_ids: r.genre_ids,
    reason: r.reason,
    display_order: r.display_order,
  }));

  const { error: insertError } = await supabase
    .from('recommendations')
    .insert(insertData);

  if (insertError) {
    console.error(
      `Failed to insert recommendations for user ${userId}:`,
      insertError,
    );
    if (existingRecs && existingRecs.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const restoreData = existingRecs.map(({ id, ...rest }) => rest);
      await supabase.from('recommendations').insert(restoreData);
    }
    return false;
  }

  return true;
}

/**
 * ユーザー単位のレコメンド処理
 */
export async function processUserRecommendations(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProcessResult> {
  const movieData = await collectUserMovieData(supabase, userId);
  if (!movieData) {
    return { status: 'skipped', recommendationCount: 0 };
  }

  const resolved = await generateRecommendationsWithRetry(
    movieData.favoriteMovies,
    movieData.excludedTitles,
    movieData.baseExcludedIds,
    movieData.dismissedMovies,
  );

  if (resolved.length === 0) {
    return { status: 'skipped', recommendationCount: 0 };
  }

  const success = await upsertRecommendations(supabase, userId, resolved);
  if (!success) {
    return { status: 'skipped', recommendationCount: 0 };
  }

  return { status: 'processed', recommendationCount: resolved.length };
}

/**
 * レコメンド生成CRONのメイン処理
 * ユーザーをバッチ単位（5件ずつ）で並行処理し、リソース負荷を制限する
 */
export async function executeGenerateRecommendationsCron(
  supabase: SupabaseClient,
): Promise<CronResult> {
  const userResult = await fetchActiveUserIds(supabase);
  if (userResult.type === 'error') {
    return userResult;
  }

  const { activeUserIds, inactiveUsers } = userResult;
  let processedUsers = 0;
  let skippedUsers = 0;
  let totalRecommendations = 0;

  const totalBatches = Math.ceil(
    activeUserIds.length / RECOMMENDATIONS_BATCH_SIZE,
  );

  for (let i = 0; i < activeUserIds.length; i += RECOMMENDATIONS_BATCH_SIZE) {
    const batchIndex = Math.floor(i / RECOMMENDATIONS_BATCH_SIZE) + 1;
    const batch = activeUserIds.slice(i, i + RECOMMENDATIONS_BATCH_SIZE);

    console.log(
      `Processing batch ${batchIndex}/${totalBatches}... (${batch.length} users)`,
    );

    let batchSuccess = 0;
    let batchFailed = 0;

    const results = await Promise.all(
      batch.map(async (userId) => {
        try {
          return await processUserRecommendations(supabase, userId);
        } catch (error) {
          console.error(
            `Error processing recommendations for user ${userId}:`,
            error,
          );
          return { status: 'skipped' as const, recommendationCount: 0 };
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'processed') {
        processedUsers++;
        batchSuccess++;
        totalRecommendations += result.recommendationCount;
      } else {
        skippedUsers++;
        batchFailed++;
      }
    }

    console.log(
      `Completed batch ${batchIndex}/${totalBatches}: ${batchSuccess} success, ${batchFailed} failed`,
    );
  }

  return {
    type: 'success',
    data: {
      processed_users: processedUsers,
      skipped_users: skippedUsers,
      inactive_users: inactiveUsers,
      total_recommendations: totalRecommendations,
    },
  };
}
