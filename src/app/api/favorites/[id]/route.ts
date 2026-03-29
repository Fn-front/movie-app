/**
 * お気に入り個別操作API
 * PATCH /api/favorites/:id - 評価更新
 * DELETE /api/favorites/:id - お気に入り削除（論理削除）
 */

import { NextResponse } from 'next/server';

import {
  softDeleteById,
  notFoundResponse,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import {
  isValidUuid,
  invalidUuidResponse,
  parseAndValidate,
} from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { favoritesUpdateSchema } from '@/schema/favorites';
import {
  HTTP_STATUS,
  FAVORITES_ERROR_MESSAGES,
  FAVORITES_SUCCESS_MESSAGES,
} from '@/constants';

const RATE_LIMIT_ACTION = 'write_api_favorites';
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 1;

export const PATCH = withAuth(
  async ({ session, supabase, request, params }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION,
      RATE_LIMIT_MAX_ATTEMPTS,
      RATE_LIMIT_WINDOW_MINUTES,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const { id } = await params!;

    // UUID形式チェック
    if (!isValidUuid(id)) {
      return invalidUuidResponse(FAVORITES_ERROR_MESSAGES.INVALID_ID);
    }

    // リクエストボディのパース + バリデーション
    const { data: validatedData, error: validationError } =
      await parseAndValidate(
        request,
        favoritesUpdateSchema,
        FAVORITES_ERROR_MESSAGES.INVALID_BODY,
      );

    if (validationError) return validationError;

    // 評価更新（自分のお気に入りかつ未削除のもののみ）
    const { data, error } = await supabase
      .from('favorites')
      .update({ rating: validatedData.rating })
      .eq('id', id)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, rating, added_at',
      )
      .single();

    if (error || !data) {
      return notFoundResponse(FAVORITES_ERROR_MESSAGES.NOT_FOUND);
    }

    return NextResponse.json(
      {
        success: true,
        message: FAVORITES_SUCCESS_MESSAGES.UPDATED,
        data,
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Favorites update error',
    errorMessage: FAVORITES_ERROR_MESSAGES.UPDATE_FAILED,
  },
);

export const DELETE = withAuth(
  async ({ session, supabase, params }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION,
      RATE_LIMIT_MAX_ATTEMPTS,
      RATE_LIMIT_WINDOW_MINUTES,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const { id } = await params!;

    // UUID形式チェック
    if (!isValidUuid(id)) {
      return invalidUuidResponse(FAVORITES_ERROR_MESSAGES.INVALID_ID);
    }

    // 論理削除（自分のお気に入りかつ未削除のもののみ）
    const success = await softDeleteById(
      supabase,
      'favorites',
      id,
      session.user.id,
    );
    if (!success) return notFoundResponse(FAVORITES_ERROR_MESSAGES.NOT_FOUND);

    return NextResponse.json(
      {
        success: true,
        message: FAVORITES_SUCCESS_MESSAGES.REMOVED,
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Favorites remove error',
    errorMessage: FAVORITES_ERROR_MESSAGES.REMOVE_FAILED,
  },
);
