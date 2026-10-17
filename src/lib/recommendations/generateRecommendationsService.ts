/**
 * レコメンド生成サービス
 * CRONルートから分離したビジネスロジック
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_MAX_RETRIES,
  RECOMMENDATIONS_INITIAL_HIT_RATE,
  RECOMMENDATIONS_MIN_HIT_RATE,
  RECOMMENDATIONS_MAX_REQUEST_COUNT,
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
 *
 * プロンプトへ渡すタイトルは「ウォッチリストのみ」に絞る。
 * お気に入りと興味なしは専用セクションで既にプロンプトへ載っており、
 * 除外リストとして再掲すると同じタイトルを二重に送ることになる。
 * 実際の除外は `baseExcludedIds` によるID照合で行うため情報は失われない。
 */
export async function collectUserMovieData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  favoriteMovies: FavoriteMovie[];
  watchlistTitles: string[];
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
    .select(
      'tmdb_movie_id, title, genre_ids, keywords, director_name, release_year',
    )
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

  const watchlistTitles = (watchlistItems || []).map((w) => w.title as string);
  const baseExcludedIds = new Set(excludedMovies.map((m) => m.tmdb_movie_id));

  return { favoriteMovies, watchlistTitles, baseExcludedIds, dismissedMovies };
}

/**
 * AIへ要求する候補件数を算出する
 *
 * AIが返した候補の多くは、お気に入り・ウォッチリストと重複していたり
 * TMDbで解決できなかったりして採用に至らない。必要件数ぴったりを要求すると
 * 毎回足りずにリトライが必要になるため、採用率で割り戻した件数を要求する。
 *
 * 初回は想定採用率を使い、2回目以降は直前の試行の実測値に置き換えることで、
 * 既視聴作品が多く衝突しやすいユーザーほど自動的に多く要求するようになる。
 *
 * @param remainingCount - あと何件必要か
 * @param previousHitRate - 直前の試行の採用率。初回は undefined
 * @returns AIへ要求する件数
 */
export function calculateRequestCount(
  remainingCount: number,
  previousHitRate?: number,
): number {
  const hitRate = Math.max(
    previousHitRate ?? RECOMMENDATIONS_INITIAL_HIT_RATE,
    RECOMMENDATIONS_MIN_HIT_RATE,
  );
  return Math.min(
    Math.ceil(remainingCount / hitRate),
    RECOMMENDATIONS_MAX_REQUEST_COUNT,
  );
}

/**
 * AIレコメンド生成（リトライロジック含む）
 *
 * @param signal - 中断シグナル。クライアント離脱時に外部API呼び出しを打ち切る
 */
export async function generateRecommendationsWithRetry(
  favoriteMovies: FavoriteMovie[],
  watchlistTitles: string[],
  baseExcludedIds: Set<number>,
  dismissedMovies: DismissedMovie[],
  signal?: AbortSignal,
): Promise<ResolvedRecommendation[]> {
  const allResolved: ResolvedRecommendation[] = [];
  let remainingCount = RECOMMENDATIONS_MAX_COUNT;
  let retryExcludedIds = baseExcludedIds;
  let previousHitRate: number | undefined;

  for (let attempt = 0; attempt <= RECOMMENDATIONS_MAX_RETRIES; attempt++) {
    // 中断済みならリトライに入らず、ここまでの結果で打ち切る
    if (signal?.aborted) {
      break;
    }

    const requestCount = calculateRequestCount(remainingCount, previousHitRate);
    const aiRecommendations = await fetchRecommendationsFromOpenAI(
      favoriteMovies,
      watchlistTitles,
      requestCount,
      dismissedMovies,
      signal,
    );

    if (!aiRecommendations) {
      break;
    }

    const resolvedInAttempt = await resolveRecommendationsWithTMDb(
      aiRecommendations,
      retryExcludedIds,
      remainingCount,
      signal,
    );

    // 次の試行の要求件数に使う採用率。0件なら下限値が効くので除算のみ行う
    previousHitRate = resolvedInAttempt.length / aiRecommendations.length;

    for (const item of resolvedInAttempt) {
      // 多めに解決されても最大件数で丸める（オーバーシュート防止）
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
  }

  return allResolved;
}

/**
 * レコメンドをトランザクション内で全件洗い替えする
 *
 * DELETE → INSERT を Supabase JS から2リクエストで行うと PostgreSQL の
 * トランザクションにならず、間でプロセスが落ちると既存レコメンドが全消失した
 * 状態で残りうる。PL/pgSQL 関数を1回呼ぶことで原子性を担保する。
 */
export async function upsertRecommendations(
  supabase: SupabaseClient,
  userId: string,
  resolved: ResolvedRecommendation[],
): Promise<boolean> {
  const { error } = await supabase.rpc('upsert_recommendations', {
    p_user_id: userId,
    p_recommendations: resolved.map((r) => ({
      tmdb_movie_id: r.tmdb_movie_id,
      title: r.title,
      poster_path: r.poster_path,
      release_date: r.release_date,
      vote_average: r.vote_average,
      vote_count: r.vote_count,
      genre_ids: r.genre_ids,
      reason: r.reason,
      display_order: r.display_order,
    })),
  });

  if (error) {
    console.error(
      `Failed to upsert recommendations for user ${userId}:`,
      error,
    );
    return false;
  }

  return true;
}

/**
 * ユーザー単位のレコメンド処理
 *
 * @param signal - 中断シグナル。クライアント離脱時に生成を打ち切り、
 *                 DBへの書き込みも行わない（既存レコメンドを保持するため）
 */
export async function processUserRecommendations(
  supabase: SupabaseClient,
  userId: string,
  signal?: AbortSignal,
): Promise<UserProcessResult> {
  const movieData = await collectUserMovieData(supabase, userId);
  if (!movieData) {
    return { status: 'skipped', recommendationCount: 0 };
  }

  const resolved = await generateRecommendationsWithRetry(
    movieData.favoriteMovies,
    movieData.watchlistTitles,
    movieData.baseExcludedIds,
    movieData.dismissedMovies,
    signal,
  );

  if (resolved.length === 0) {
    return { status: 'skipped', recommendationCount: 0 };
  }

  // 中断済みなら書き込まない。中途半端な件数で洗い替えすると
  // 既存レコメンドを質の低い結果で上書きしてしまうため。
  if (signal?.aborted) {
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
