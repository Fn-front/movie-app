/**
 * 視聴済み一括削除API
 * POST /api/watchlist/bulk-delete - 追加年を指定して視聴済みをまとめて論理削除
 *
 * DELETE ではなく POST にしているのは、ボディ付き DELETE が fetch やプロキシで
 * 扱いが揺れるため。
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { watchlistBulkDeleteSchema } from '@/schema/watchlist';
import { getJstYearRange } from '@/utils/date';

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    // 1リクエストで多数の行を更新するが、レート制限は他の書き込みと同じ枠を共有する
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_WATCHLIST,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const parsed = await parseAndValidate(
      request,
      watchlistBulkDeleteSchema,
      WATCHLIST_ERROR_MESSAGES.INVALID_BODY,
    );
    if (parsed.error) return parsed.error;

    const { year, exclude_ids } = parsed.data;

    // 年の境界は JST。UTC のまま切ると 1/1 早朝に追加した行が前年に落ちる
    const { start, end } = getJstYearRange(year);

    // withAuth は service role クライアントを使うため RLS は効かない。
    // 他ユーザーの行を守るのは user_id 条件だけ。一括更新では特に落とさないこと
    let query = supabase
      .from('watchlist')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .not('watched_at', 'is', null)
      .gte('added_at', start)
      .lt('added_at', end);

    // 空配列で not('id', 'in', '()') を組むと構文エラーになるため、
    // 除外が無いときは条件自体を付けない。
    //
    // join で PostgREST のフィルタ構文を組み立てている。ここが安全なのは
    // watchlistBulkDeleteSchema が各要素を UUID に限定しているからで、
    // スキーマ側の検証を緩めるとそのままクエリ構文への注入経路になる。
    // exclude_ids の型を変えるときは必ずこの行も見直すこと。
    if (exclude_ids.length > 0) {
      query = query.not('id', 'in', `(${exclude_ids.join(',')})`);
    }

    const { data, error } = await query.select('id');

    if (error) {
      throw error;
    }

    const deletedCount = data?.length ?? 0;

    return NextResponse.json(
      {
        success: true,
        message: WATCHLIST_SUCCESS_MESSAGES.bulkDeleted(deletedCount),
        data: { deleted_count: deletedCount },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist bulk delete error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.BULK_DELETE_FAILED,
  },
);
