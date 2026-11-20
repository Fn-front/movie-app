/**
 * レコメンド生成サービス
 * CRONルートから分離したビジネスロジック
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DISMISSED_MOVIES_MAX_PAGES,
  DISMISSED_MOVIES_PAGE_SIZE,
} from '@/constants/dismissedMovies';
import {
  FAVORITES_LOOKUP_MAX_PAGES,
  FAVORITES_LOOKUP_PAGE_SIZE,
} from '@/constants/favorites';
import {
  WATCHLIST_LOOKUP_MAX_PAGES,
  WATCHLIST_LOOKUP_PAGE_SIZE,
} from '@/constants/watchlist';
import { fetchAllPages, type PageResult } from '@/helpers/fetchAllPages';

import {
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_MAX_RETRIES,
  RECOMMENDATIONS_INITIAL_HIT_RATE,
  RECOMMENDATIONS_MIN_HIT_RATE,
  RECOMMENDATIONS_MAX_REQUEST_COUNT,
  RECOMMENDATIONS_ACTIVE_USER_DAYS,
  RECOMMENDATION_EVENT_RETENTION_DAYS,
  RECOMMENDATIONS_DIVERSITY_POOL_EXTRA,
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
import {
  applyDiversityReranking,
  buildRetryStrategy,
} from '@/lib/recommendations/recommendationStrategy';

/**
 * 生成処理の内訳メトリクス
 *
 * 改善の効果を判断するには「何件返せたか」だけでは足りない。
 * AI呼び出し回数・解決失敗数・リトライ回数を記録し、
 * 件数が埋まらない原因がどこにあるかを切り分けられるようにする。
 */
export interface GenerationMetrics {
  /** OpenAI呼び出し回数 */
  openai_calls: number;
  /** AIが返した候補の総数 */
  ai_candidates: number;
  /** TMDbで解決できず、または除外されて採用に至らなかった候補数 */
  unresolved_candidates: number;
  /** 追加で行った試行回数（初回を除く） */
  retries_used: number;
}

/** 空のメトリクスを生成する */
function createEmptyMetrics(): GenerationMetrics {
  return {
    openai_calls: 0,
    ai_candidates: 0,
    unresolved_candidates: 0,
    retries_used: 0,
  };
}

/** メトリクスを加算する */
function addMetrics(
  base: GenerationMetrics,
  addition: GenerationMetrics,
): GenerationMetrics {
  return {
    openai_calls: base.openai_calls + addition.openai_calls,
    ai_candidates: base.ai_candidates + addition.ai_candidates,
    unresolved_candidates:
      base.unresolved_candidates + addition.unresolved_candidates,
    retries_used: base.retries_used + addition.retries_used,
  };
}

/** ユーザー単位の処理結果 */
interface UserProcessResult {
  /**
   * ⚠️ **`failed` を `skipped` と分けること（#1354）。**
   *
   * 以前はどちらも `skipped` で、サマリーの `skipped_users` が
   * 「お気に入りが足りない」と「例外で落ちた」の両方を指していた。
   * 全員が例外で落ちても `skipped_users` が増えるだけなので、
   * 正常な実行と見分けがつかなかった。
   */
  status: 'processed' | 'skipped' | 'failed';
  recommendationCount: number;
  metrics: GenerationMetrics;
}

/** 全体の処理サマリー */
export interface GenerateRecommendationsSummary {
  processed_users: number;
  /** 対象外だった利用者（お気に入り不足など）。失敗ではない */
  skipped_users: number;
  /** 例外で処理できなかった利用者（#1354） */
  failed_users: number;
  inactive_users: number;
  total_recommendations: number;
  metrics: GenerationMetrics;
  /** 保持期間を超えて削除した利用イベント数 */
  deleted_events: number;
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
  // ⚠️ 3本とも `range()` で区切る（#1318）。
  //
  // PostgREST は `max_rows`（1000 / `supabase/config.toml`）を超えた結果を
  // エラーも truncation フラグも返さずに打ち切る。絞り込み無しで投げると
  // 1001件目以降が静かに消え、**除外集合に入らない**。
  //
  // 症状は対象で変わる。お気に入り／ウォッチリストが欠けると
  // 「既に登録済みの作品」がレコメンドに出る。興味なしが欠けると生成時に
  // 弾けず、読み取り側（#1274 で対策済み）で落ちてレコメンド枠が黙って減る。
  //
  // ⚠️ ページングには安定した並びが要る。`id` は主キーなので全順序になる。
  // ⚠️ 定数は**既存のドメインごとのもの**を使い回す（新設しない）。
  // 値はいずれも PostgREST の `max_rows` 由来で同じだが、置き場所を
  // `src/constants/` に揃えないと「同じ 1000 が4箇所」になる
  const page = <T>(
    label: string,
    limits: { pageSize: number; maxPages: number },
    query: (from: number, to: number) => PromiseLike<PageResult<T>>,
  ) =>
    fetchAllPages<T>({
      pageSize: limits.pageSize,
      maxPages: limits.maxPages,
      label,
      context: `user=${userId}`,
      query,
    });

  const FAVORITES_LIMITS = {
    pageSize: FAVORITES_LOOKUP_PAGE_SIZE,
    maxPages: FAVORITES_LOOKUP_MAX_PAGES,
  };
  const WATCHLIST_LIMITS = {
    pageSize: WATCHLIST_LOOKUP_PAGE_SIZE,
    maxPages: WATCHLIST_LOOKUP_MAX_PAGES,
  };
  const DISMISSED_LIMITS = {
    pageSize: DISMISSED_MOVIES_PAGE_SIZE,
    maxPages: DISMISSED_MOVIES_MAX_PAGES,
  };

  // ⚠️ お気に入りだけは取得失敗を握らない。0件と区別できないまま進むと
  // 「お気に入りが無いので生成しない」と同じ扱いになり、実際には
  // 持っている利用者のレコメンドが黙って作られなくなる
  //
  // ⛔ **`null` を2つの意味に使わない（#1354）。** 以前はここも `null` を
  //   返していたため、呼び出し側が「対象外」と区別できず `skipped` に
  //   落ちていた。CRON の通知は `failed` しか数えないので、DBエラーで
  //   全員ぶん生成できなくても無言だった。失敗は投げて区別する
  let favorites: { tmdb_movie_id: number; title: string; rating: number }[];

  try {
    favorites = await page(
      'recommendations-favorites',
      FAVORITES_LIMITS,
      (from, to) =>
        supabase
          .from('favorites')
          .select('tmdb_movie_id, title, rating')
          .eq('user_id', userId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to),
    );
  } catch (error) {
    console.error('Favorites query error:', error);
    throw error;
  }

  // ここから先の `null` は「対象外」だけを意味する
  if (favorites.length === 0) {
    return null;
  }

  const favoriteMovies: FavoriteMovie[] = favorites.map((f) => ({
    title: f.title,
    rating: f.rating,
  }));

  /**
   * ウォッチリストと興味なしの取得失敗を「空」として扱う
   *
   * 従来どおり、除外が甘くなるだけでレコメンド自体は作れる。ただしログには残す。
   *
   * ⚠️ **握るのは PostgREST が返したエラーだけ。** `Error` は投げ直す。
   *
   * 変更前は `{ error }` を無視して続行し、fetch 自体の reject は
   * そのまま伝播していた（＝そのユーザーは skip され、**既存のレコメンドは
   * 残った**）。全部握ると、空の除外集合のまま生成を続けて
   * `upsert_recommendations` が洗い替えるため、**劣化した内容で既存の
   * レコメンドを上書きする**。その非対称さを保つ。
   */
  const swallowQueryError =
    <T>(label: string, fallback: T[]) =>
    (cause: unknown): T[] => {
      if (cause instanceof Error) {
        throw cause;
      }

      console.error(`${label} query error:`, cause);
      return fallback;
    };

  const watchlistItems = await page<{ tmdb_movie_id: number; title: string }>(
    'recommendations-watchlist',
    WATCHLIST_LIMITS,
    (from, to) =>
      supabase
        .from('watchlist')
        .select('tmdb_movie_id, title')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to),
  ).catch(
    swallowQueryError<{ tmdb_movie_id: number; title: string }>(
      'Watchlist',
      [],
    ),
  );

  const dismissedMovies = await page<DismissedMovie>(
    'recommendations-dismissed',
    DISMISSED_LIMITS,
    (from, to) =>
      supabase
        .from('dismissed_movies')
        .select(
          'tmdb_movie_id, title, genre_ids, keywords, director_name, release_year',
        )
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to),
  ).catch(swallowQueryError<DismissedMovie>('Dismissed movies', []));

  const excludedMovies: ExcludedMovie[] = [
    ...favorites.map((f) => ({
      tmdb_movie_id: f.tmdb_movie_id,
      title: f.title,
    })),
    ...watchlistItems.map((w) => ({
      tmdb_movie_id: w.tmdb_movie_id,
      title: w.title,
    })),
    ...dismissedMovies.map((d) => ({
      tmdb_movie_id: d.tmdb_movie_id,
      title: d.title,
    })),
  ];

  const watchlistTitles = watchlistItems.map((w) => w.title);
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
): Promise<{
  resolved: ResolvedRecommendation[];
  metrics: GenerationMetrics;
  /**
   * OpenAI の呼び出し自体が失敗したか（#1354）
   *
   * ⚠️ `fetchRecommendationsFromOpenAI` は **throw しない**。キー未設定も
   * HTTPエラーも JSON 破損もスキーマ違反も `null` を返す。呼び出し側は
   * 「候補が0件だった」と区別できず、**鍵が失効しても `skipped` に落ちて
   * 無言になっていた**。
   */
  aiUnavailable: boolean;
}> {
  const allResolved: ResolvedRecommendation[] = [];
  const metrics = createEmptyMetrics();
  let aiUnavailable = false;
  let remainingCount = RECOMMENDATIONS_MAX_COUNT;
  let retryExcludedIds = baseExcludedIds;
  let previousHitRate: number | undefined;

  for (let attempt = 0; attempt <= RECOMMENDATIONS_MAX_RETRIES; attempt++) {
    // 中断済みならリトライに入らず、ここまでの結果で打ち切る
    if (signal?.aborted) {
      break;
    }

    if (attempt > 0) {
      metrics.retries_used++;
    }

    const requestCount = calculateRequestCount(remainingCount, previousHitRate);
    metrics.openai_calls++;
    const aiRecommendations = await fetchRecommendationsFromOpenAI(
      favoriteMovies,
      watchlistTitles,
      requestCount,
      dismissedMovies,
      signal,
      buildRetryStrategy(attempt),
    );

    if (!aiRecommendations) {
      aiUnavailable = true;
      break;
    }

    // 多様性リランキングで入れ替える余地を作るため、必要数より多めに解決する
    const resolvedInAttempt = await resolveRecommendationsWithTMDb(
      aiRecommendations,
      retryExcludedIds,
      remainingCount + RECOMMENDATIONS_DIVERSITY_POOL_EXTRA,
      signal,
    );

    metrics.ai_candidates += aiRecommendations.length;
    metrics.unresolved_candidates +=
      aiRecommendations.length - resolvedInAttempt.length;

    // 次の試行の要求件数に使う採用率。0件なら下限値が効くので除算のみ行う
    previousHitRate = resolvedInAttempt.length / aiRecommendations.length;

    // 多めに解決した候補から、ジャンルが偏らないように必要数を選抜する
    const rerankedInAttempt = applyDiversityReranking(
      resolvedInAttempt,
      remainingCount,
    );

    for (const item of rerankedInAttempt) {
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

  return { resolved: allResolved, metrics, aiUnavailable };
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
    return {
      status: 'skipped',
      recommendationCount: 0,
      metrics: createEmptyMetrics(),
    };
  }

  const { resolved, metrics, aiUnavailable } =
    await generateRecommendationsWithRetry(
      movieData.favoriteMovies,
      movieData.watchlistTitles,
      movieData.baseExcludedIds,
      movieData.dismissedMovies,
      signal,
    );

  // スキップした場合もAI・TMDbは消費しているため、メトリクスは必ず返す
  //
  // ⚠️ **「候補が0件」と「OpenAI が落ちた」を分ける（#1354）。**
  //   前者は利用者の嗜好しだいで普通に起きるが、後者は鍵の失効や
  //   API 障害で、人が動かないと直らない。同じ `skipped` にすると
  //   CRON の通知（`failed` を数える）に一切乗らない
  if (resolved.length === 0) {
    return {
      status: aiUnavailable ? 'failed' : 'skipped',
      recommendationCount: 0,
      metrics,
    };
  }

  // 中断済みなら書き込まない。中途半端な件数で洗い替えすると
  // 既存レコメンドを質の低い結果で上書きしてしまうため。
  if (signal?.aborted) {
    return { status: 'skipped', recommendationCount: 0, metrics };
  }

  // ⚠️ 書き込みの失敗は**失敗**。利用者の事情では起きない（#1354）
  const success = await upsertRecommendations(supabase, userId, resolved);
  if (!success) {
    return { status: 'failed', recommendationCount: 0, metrics };
  }

  return {
    status: 'processed',
    recommendationCount: resolved.length,
    metrics,
  };
}

/**
 * 保持期間を超えたレコメンド利用イベントを削除する
 *
 * 行動ログは個人の嗜好に直結するため無期限に保持しない。
 * 削除に失敗しても生成処理は続行する（計測データの掃除は副次処理のため）。
 *
 * @returns 削除件数。失敗時は 0
 */
export async function deleteExpiredRecommendationEvents(
  supabase: SupabaseClient,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(
      'delete_expired_recommendation_events',
      { retention_days: RECOMMENDATION_EVENT_RETENTION_DAYS },
    );

    if (error) {
      console.error('Failed to delete expired recommendation events:', error);
      return 0;
    }

    return typeof data === 'number' ? data : 0;
  } catch (error) {
    // 生成が全て終わったあとの掃除処理。ここで落ちて
    // CRON全体を失敗扱いにしない。
    console.error('Failed to delete expired recommendation events:', error);
    return 0;
  }
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
  let failedUsers = 0;
  let totalRecommendations = 0;
  let metrics = createEmptyMetrics();

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
          return {
            status: 'failed' as const,
            recommendationCount: 0,
            metrics: createEmptyMetrics(),
          };
        }
      }),
    );

    for (const result of results) {
      metrics = addMetrics(metrics, result.metrics);
      if (result.status === 'processed') {
        processedUsers++;
        batchSuccess++;
        totalRecommendations += result.recommendationCount;
        continue;
      }

      if (result.status === 'failed') {
        failedUsers++;
        batchFailed++;
        continue;
      }

      skippedUsers++;
    }

    console.log(
      `Completed batch ${batchIndex}/${totalBatches}: ${batchSuccess} success, ${batchFailed} failed`,
    );
  }

  // 生成のついでに保持期間切れの行動ログを掃除する。
  // 専用CRONを増やさずに済み、日次で確実に回る。
  const deletedEvents = await deleteExpiredRecommendationEvents(supabase);

  console.log(
    `Generation metrics: openai_calls=${metrics.openai_calls} ai_candidates=${metrics.ai_candidates} unresolved=${metrics.unresolved_candidates} retries=${metrics.retries_used} deleted_events=${deletedEvents}`,
  );

  return {
    type: 'success',
    data: {
      processed_users: processedUsers,
      skipped_users: skippedUsers,
      failed_users: failedUsers,
      inactive_users: inactiveUsers,
      total_recommendations: totalRecommendations,
      metrics,
      deleted_events: deletedEvents,
    },
  };
}
