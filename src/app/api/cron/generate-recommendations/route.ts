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

import { HTTP_STATUS, ERROR_CODE, AUTH_ERROR_MESSAGES } from '@/constants';
import { createServiceRoleClient } from '@/helpers/supabase';
import {
  fetchRecommendationsFromOpenAI,
  resolveRecommendationsWithTMDb,
  type FavoriteMovie,
  type ExcludedMovie,
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

    let processedUsers = 0;
    let skippedUsers = 0;
    let totalRecommendations = 0;

    for (const userId of usersWithFavorites) {
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

        // 除外リスト取得（お気に入り + ウォッチリストの映画）
        const { data: watchlistItems } = await supabase
          .from('watchlist')
          .select('tmdb_movie_id, title')
          .eq('user_id', userId)
          .is('deleted_at', null);

        const excludedMovies: ExcludedMovie[] = [
          ...favorites.map((f) => ({
            tmdb_movie_id: f.tmdb_movie_id,
            title: f.title,
          })),
          ...(watchlistItems || []).map((w) => ({
            tmdb_movie_id: w.tmdb_movie_id,
            title: w.title,
          })),
        ];

        const excludedTitles = excludedMovies.map((m) => m.title);
        const excludedIds = new Set(excludedMovies.map((m) => m.tmdb_movie_id));

        // OpenAI APIでレコメンド生成
        const aiRecommendations = await fetchRecommendationsFromOpenAI(
          favoriteMovies,
          excludedTitles,
        );

        if (!aiRecommendations) {
          skippedUsers++;
          continue;
        }

        // TMDb検索で映画情報を解決
        const resolved = await resolveRecommendationsWithTMDb(
          aiRecommendations,
          excludedIds,
        );

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
