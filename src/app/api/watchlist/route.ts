/**
 * ウォッチリストAPI
 * GET /api/watchlist - ウォッチリスト一覧取得（カーソルベースページング）
 * POST /api/watchlist - ウォッチリストに追加
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  WATCHLIST_SELECT,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  STREAMING_SCOPE_DEFAULT,
} from '@/constants';
import type { StreamingScope } from '@/constants';
import {
  checkDuplicate,
  conflictResponse,
  isUniqueViolation,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { initMovieStreamingStatus } from '@/lib/sync/initMovieStreamingStatus';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';
import { watchlistQuerySchema, watchlistAddSchema } from '@/schema/watchlist';

/**
 * 追加時に TMDb へ1回問い合わせる（配信状況の初期化）ぶんの余裕を持たせる。
 *
 * TMDb 側は1リクエスト10秒で打ち切る（TMDB_REQUEST_TIMEOUT_MS）ので、
 * 最悪でもそこで失敗して追加は成功する。環境の既定値に依存させないために明示する
 */
export const maxDuration = 30;

export const GET = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック（#934）。
    // 識別子がセッションなので検証より前に置く
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」）
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = watchlistQuerySchema.safeParse({
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
      exclude_watched: searchParams.get('exclude_watched') ?? undefined,
      prioritize_streaming:
        searchParams.get('prioritize_streaming') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: WATCHLIST_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { cursor, limit, sort, exclude_watched, prioritize_streaming } =
      queryResult.data;

    // 並び替えは get_watchlist_sorted（RPC）に一本化している。
    // 視聴済みを最下部に送ると並び順の主キーが watched_at になり、
    // added_at だけのキーセットカーソルでは次ページの境界を表せないため、
    // 両ソートともオフセットページングにそろえた。
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;

    if (Number.isNaN(offset) || offset < 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: WATCHLIST_ERROR_MESSAGES.INVALID_QUERY,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 優先表示するときだけ設定を引く。
    // サイドバーは prioritize_streaming=false で呼ぶので、余計なクエリを増やさない
    let streamingScope: StreamingScope = STREAMING_SCOPE_DEFAULT;

    if (prioritize_streaming) {
      // 取得に失敗しても既定値で並べる。設定が読めないだけで
      // 一覧全体が見られなくなる方が困るため
      const { data: settings } = await supabase
        .from('user_settings')
        .select('streaming_notice_scope')
        .eq('user_id', session.user.id)
        .maybeSingle();

      // 設定が未作成、または列を足す前に作られた行は既定値に倒す
      streamingScope = (settings?.streaming_notice_scope ??
        STREAMING_SCOPE_DEFAULT) as StreamingScope;
    }

    const { data, error } = await supabase.rpc('get_watchlist_sorted', {
      p_user_id: session.user.id,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
      p_exclude_watched: exclude_watched,
      p_prioritize_streaming: prioritize_streaming,
      p_streaming_scope: streamingScope,
    });

    if (error) {
      throw error;
    }

    const items = (data ?? []) as Array<
      WatchlistItem & {
        total_count: number;
        streaming_offer_type: 'flatrate' | 'paid' | null;
        streaming_provider_ids: number[];
        streaming_resumed: boolean;
      }
    >;
    const totalCount = items.length > 0 ? Number(items[0].total_count) : 0;
    const hasMore = offset + limit < totalCount;
    const nextCursor = hasMore ? String(offset + limit) : null;

    // 見放題のみを対象にしているユーザーには、レンタルのみの作品の
    // バッジを出さない。「見放題になったときだけ」を選んでいる人にとって
    // レンタルは観るきっかけにならず、一覧では雑音になるため。
    //
    // RPC 側は範囲に関わらず実態を返す（並び順の判定にしか使っていない）。
    // 表示をどう削るかは利用者の設定の話なので、この層で決める。
    //
    // 情報自体は失わない。詳細モーダルは別経路で
    // 「配信 / レンタル / 購入」を出し続ける。
    const hidesPaidBadge = streamingScope === 'flatrate';

    // RPC は列をフラットに返すため、配信情報だけ入れ子に組み直す。
    // total_count は内部用なのでレスポンスから除く
    const watchlist = items.map(
      ({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        total_count,
        streaming_offer_type,
        streaming_provider_ids,
        streaming_resumed,
        ...item
      }) => {
        const showsBadge =
          streaming_offer_type !== null &&
          !(hidesPaidBadge && streaming_offer_type === 'paid');

        return {
          ...item,
          streaming: showsBadge
            ? {
                offer_type: streaming_offer_type,
                provider_ids: streaming_provider_ids ?? [],
                resumed: streaming_resumed,
              }
            : null,
        };
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          watchlist,
          next_cursor: nextCursor,
          has_more: hasMore,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist fetch error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.FETCH_FAILED,
  },
);

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック
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

    // リクエストボディのパース + バリデーション
    const parsed = await parseAndValidate(
      request,
      watchlistAddSchema,
      WATCHLIST_ERROR_MESSAGES.INVALID_BODY,
    );
    if (parsed.error) return parsed.error;

    // 重複チェック（deleted_at IS NULLの条件はUNIQUEインデックスで保証）
    const isDuplicate = await checkDuplicate(
      supabase,
      'watchlist',
      session.user.id,
      parsed.data.tmdb_movie_id,
    );

    if (isDuplicate) {
      return conflictResponse(WATCHLIST_ERROR_MESSAGES.ALREADY_EXISTS);
    }

    // ウォッチリストに追加
    const { data: inserted, error: insertError } = await supabase
      .from('watchlist')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: parsed.data.tmdb_movie_id,
        title: parsed.data.title,
        poster_path: parsed.data.poster_path ?? null,
        release_date: parsed.data.release_date ?? null,
      })
      .select(WATCHLIST_SELECT)
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        return conflictResponse(WATCHLIST_ERROR_MESSAGES.ALREADY_EXISTS);
      }
      throw insertError;
    }

    // 配信バッジの元データを、ここで1回だけ埋める。
    // 日次 Cron だけに任せると、追加時点ですでに配信中の作品でも
    // 最長で約24時間バッジが出なかった（#942）。
    //
    // after() ではなくレスポンス前に待つ。クライアントは追加直後に
    // 一覧を取り直すため、後回しにすると結局その場では反映されない。
    // 行がある作品では TMDb を引かないので、追加のたびに遅くなるわけではない。
    //
    // 失敗しても追加自体は成功させる（内部でログを出して握る）
    await initMovieStreamingStatus(supabase, parsed.data.tmdb_movie_id);

    return NextResponse.json(
      {
        success: true,
        message: WATCHLIST_SUCCESS_MESSAGES.ADDED,
        data: inserted,
      },
      { status: HTTP_STATUS.CREATED },
    );
  },
  {
    errorLog: 'Watchlist add error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.ADD_FAILED,
  },
);
