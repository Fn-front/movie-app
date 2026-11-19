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
 * Postgres の UNIQUE 制約違反（SQLSTATE 23505）判定。
 *
 * ⚠️ `favorites` / `watchlist` の POST では、これが**重複を検出する唯一の
 * 経路**（#1277 で事前チェックの SELECT を外した）。保険ではない。
 *
 * 重複は部分UNIQUEインデックス
 * （`idx_favorites_user_movie` / `idx_watchlist_user_movie`。どちらも
 * `WHERE deleted_at IS NULL`）が保証している。実際に重複 INSERT を投げて、
 * supabase-js が `code: '23505'` と制約名入りの message を返すことを
 * 確認済み（2026-11-19）。
 *
 * ⚠️ 副作用として、**重複 POST は毎回 Postgres の ERROR ログに出る**。
 * かつて #547 はそのログ（`duplicate key value violates unique constraint`）
 * を見て起票された。これは想定どおりで、同じ観測で起票し直さないこと。
 *
 * ⚠️ `upsert` / `ON CONFLICT DO NOTHING` には置き換えられない。対象が
 * 部分UNIQUEインデックスなので ON CONFLICT の推論に index_predicate
 * （`WHERE deleted_at IS NULL`）が要るが、PostgREST の `on_conflict` は
 * 列名しか送れず推論に失敗する。
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
