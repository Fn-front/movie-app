/**
 * レコメンド生成 Cron API
 * GET /api/cron/generate-recommendations
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * 処理フロー:
 * 1. お気に入り1件以上のユーザーを取得
 * 2. ユーザーごとに: お気に入り取得 → 除外リスト取得 → OpenAI → TMDb検索 → DB保存
 * 3. ユーザー単位のtry-catchで1ユーザーの失敗が他に影響しない
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_MAX_RETRIES,
  RECOMMENDATIONS_ACTIVE_USER_DAYS,
} from '@/constants';
import { createServiceRoleClient } from '@/helpers/supabase';
import {
  fetchRecommendationsFromOpenAI,
  resolveRecommendationsWithTMDb,
  type FavoriteMovie,
  type ExcludedMovie,
  type DismissedMovie,
  type ResolvedRecommendation,
} from '@/lib/openai/generateRecommendations';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    // CRON_SECRETで認証
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.UNAUTHORIZED,
            message: AUTH_ERROR_MESSAGES.AUTH_FAILED,
          },
        },
        { status: HTTP_STATUS.UNAUTHORIZED },
      );
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    // お気に入り1件以上のユーザーIDを取得（user_idのみ選択し、JSでユニーク化）
    const { data: favoriteRows, error: usersError } = await supabase
      .from('favorites')
      .select('user_id')
      .is('deleted_at', null);

    const usersWithFavorites = favoriteRows
      ? [...new Set(favoriteRows.map((f) => f.user_id as string))]
      : null;

    if (usersError || !usersWithFavorites) {
      console.error('Failed to fetch users with favorites:', usersError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: 'ユーザー取得に失敗しました',
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    // アクティブユーザーのみにフィルタリング（last_login_at が直近N日以内）
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
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: 'アクティブユーザー取得に失敗しました',
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    const activeUserIds = activeUsers
      ? activeUsers.map((u) => u.id as string)
      : [];

    const inactiveUsers = usersWithFavorites.length - activeUserIds.length;
    let processedUsers = 0;
    let skippedUsers = 0;
    let totalRecommendations = 0;

    for (const userId of activeUserIds) {
      try {
        // お気に入り映画を取得（タイトル + 評価）
        const { data: favorites, error: favError } = await supabase
          .from('favorites')
          .select('tmdb_movie_id, title, rating')
          .eq('user_id', userId)
          .is('deleted_at', null);

        if (favError || !favorites || favorites.length === 0) {
          skippedUsers++;
          continue;
        }

        const favoriteMovies: FavoriteMovie[] = favorites.map((f) => ({
          title: f.title,
          rating: f.rating,
        }));

        // 除外リスト取得（お気に入り + ウォッチリスト + 興味なしの映画）
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
        const baseExcludedIds = new Set(
          excludedMovies.map((m) => m.tmdb_movie_id),
        );

        // OpenAI APIでレコメンド生成（リトライ付き）
        const allResolved: ResolvedRecommendation[] = [];
        let remainingCount = RECOMMENDATIONS_MAX_COUNT;
        let retryExcludedTitles = [...excludedTitles];
        let retryExcludedIds = baseExcludedIds;

        for (
          let attempt = 0;
          attempt <= RECOMMENDATIONS_MAX_RETRIES;
          attempt++
        ) {
          const aiRecommendations = await fetchRecommendationsFromOpenAI(
            favoriteMovies,
            retryExcludedTitles,
            remainingCount,
            dismissedMovies,
          );

          if (!aiRecommendations) {
            break;
          }

          // TMDb検索で映画情報を解決
          const resolvedInAttempt = await resolveRecommendationsWithTMDb(
            aiRecommendations,
            retryExcludedIds,
          );

          for (const item of resolvedInAttempt) {
            // 既に追加済みの映画は除外
            if (
              allResolved.some((r) => r.tmdb_movie_id === item.tmdb_movie_id)
            ) {
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

          // 次回リトライ用に解決済みの映画を除外リストに追加
          retryExcludedIds = new Set([
            ...baseExcludedIds,
            ...allResolved.map((r) => r.tmdb_movie_id),
          ]);
          retryExcludedTitles = [
            ...excludedTitles,
            ...allResolved.map((r) => r.title),
          ];
        }

        const resolved = allResolved;

        if (resolved.length === 0) {
          skippedUsers++;
          continue;
        }

        // 既存レコメンドを退避 → 削除 → 新規挿入
        // INSERT失敗時は退避データで復元し、レコメンドが消失しない
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
          skippedUsers++;
          continue;
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
          // INSERT失敗時は既存レコメンドを復元
          if (existingRecs && existingRecs.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const restoreData = existingRecs.map(({ id, ...rest }) => rest);
            await supabase.from('recommendations').insert(restoreData);
          }
          skippedUsers++;
          continue;
        }

        processedUsers++;
        totalRecommendations += resolved.length;
      } catch (error) {
        console.error(
          `Error processing recommendations for user ${userId}:`,
          error,
        );
        skippedUsers++;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          processed_users: processedUsers,
          skipped_users: skippedUsers,
          inactive_users: inactiveUsers,
          total_recommendations: totalRecommendations,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Generate recommendations error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: 'レコメンド生成中にエラーが発生しました。',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
