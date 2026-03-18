/**
 * API Route共通ヘルパー
 * 論理削除・重複チェック・レスポンス生成を共通化
 */

import { NextResponse } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { HTTP_STATUS, ERROR_CODE } from '@/constants';

/**
 * レコードの論理削除（deleted_atを設定）
 *
 * @returns 削除成功時true、レコード未発見時false
 */
export async function softDeleteById(
  supabase: SupabaseClient,
  table: string,
  recordId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', recordId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .single();

  return !error && !!data;
}

/**
 * 重複チェック（同一ユーザー・同一映画の未削除レコードが存在するか）
 *
 * @returns 重複が存在する場合true
 */
export async function checkDuplicate(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  tmdbMovieId: number,
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq('tmdb_movie_id', tmdbMovieId)
    .is('deleted_at', null)
    .single();

  return !!data;
}

/**
 * 409 Conflictレスポンスを生成
 */
export function conflictResponse(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.CONFLICT,
        message,
      },
    },
    { status: HTTP_STATUS.CONFLICT },
  );
}

/**
 * 404 Not Foundレスポンスを生成
 */
export function notFoundResponse(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.NOT_FOUND,
        message,
      },
    },
    { status: HTTP_STATUS.NOT_FOUND },
  );
}
