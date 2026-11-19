/**
 * API Route共通ヘルパー
 * 論理削除・重複チェック・レスポンス生成を共通化
 */

import { NextResponse } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import type { RateLimitResult } from '@/lib/rateLimit/rateLimit';

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
 * ⚠️ **INSERT の前に通すための関数ではない**（#1277）。重複は部分UNIQUE
 * インデックスが保証しており、INSERT が返す 23505 を `isUniqueViolation`
 * で 409 に変換すれば同じ応答になる。事前チェックは race も防げないので、
 * 足すと「防げない競合のために成功時も必ず1往復増やす」ことになる。
 *
 * 残っている唯一の呼び出し元は `POST /api/dismissed-movies`。あちらは
 * **INSERT の前に TMDb の呼び出しがある**ため、先に弾かないと重複
 * リクエストでも外部APIを叩いてから 409 を返すことになる。
 *
 * 同じ事情（検証の後ろに高価な処理がある）が無い限り、新しい呼び出しを
 * 足さないこと。
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
 * Postgres の UNIQUE 制約違反（SQLSTATE 23505）判定。
 * checkDuplicate と INSERT の間に生じる race を安全側で吸収するために使う。
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
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
 * 429 Too Many Requestsレスポンスを生成
 */
export function rateLimitExceededResponse(rateLimitResult: RateLimitResult) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
        message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        details: { retryAfter: rateLimitResult.retryAfter },
      },
    },
    { status: HTTP_STATUS.TOO_MANY_REQUESTS },
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
