/**
 * お気に入り個別操作API
 * PATCH /api/favorites/:id - 評価更新
 * DELETE /api/favorites/:id - お気に入り削除（論理削除）
 */

import { NextResponse } from 'next/server';

import { softDeleteById, notFoundResponse } from '@/helpers/apiHelpers';
import {
  isValidUuid,
  invalidUuidResponse,
  parseAndValidate,
} from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { favoritesUpdateSchema } from '@/schema/favorites';
import {
  HTTP_STATUS,
  FAVORITES_ERROR_MESSAGES,
  FAVORITES_SUCCESS_MESSAGES,
} from '@/constants';

export const PATCH = withAuth(
  async ({ session, supabase, request, params }) => {
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
