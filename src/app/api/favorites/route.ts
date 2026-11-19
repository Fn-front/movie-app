/**
 * お気に入りAPI
 * GET /api/favorites - お気に入り一覧取得（ページベースページング）
 * POST /api/favorites - お気に入りに追加
 */

import { NextResponse, after } from 'next/server';

import { withAuth } from '@/helpers/routeHandler';
import { parseAndValidate } from '@/helpers/requestValidation';
import {
  conflictResponse,
  isUniqueViolation,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { runInstantRecommendationIfEligible } from '@/lib/recommendations/instantRecommendation';
import { favoritesQuerySchema, favoritesAddSchema } from '@/schema/favorites';
import {
  HTTP_STATUS,
  ERROR_CODE,
  FAVORITES_SELECT,
  FAVORITES_ERROR_MESSAGES,
  FAVORITES_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  SUPABASE_ERROR_CODE,
} from '@/constants';

/**
 * 初回お気に入り追加時にレコメンド生成をバックグラウンドで走らせるため、
 * レスポンス後の処理に余裕を持たせる（after() はルートの上限内で動く）。
 */
export const maxDuration = 120;

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
    const queryResult = favoritesQuerySchema.safeParse({
      sort_by: searchParams.get('sort_by') ?? undefined,
      sort_order: searchParams.get('sort_order') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: FAVORITES_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { sort_by, sort_order, page, limit } = queryResult.data;

    // 件数とデータを1クエリで取る（#1272）
    //
    // もとは `count: 'exact', head: true` の件数専用クエリを投げてから
    // データを取っていた。PostgREST は `Content-Range` で件数を返せるので、
    // 同じ条件の走査を2回する理由が無い（`watchlist/watched` が前例）。
    //
    // ⚠️ `head: true` を**付けない**こと。付けると本体が返らず `data` が空になる
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from('favorites')
      .select(FAVORITES_SELECT, { count: 'exact' })
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    // ⚠️ 最終ページより後ろは「空ページ」であってエラーではない（#1311）。
    //
    // PostgREST は `count: 'exact'` を付けたクエリに限り、
    // `offset > 総件数` で **416 (PGRST103)** を返す（count 無しなら 200 +
    // 空配列）。件数とデータを1本にまとめた副作用でこの条件に当たるように
    // なったため、ここで潰さないと 200 から 500 へ変わる。
    //
    // お気に入り一覧は useInfiniteQuery が保持している全ページを再取得する
    // ので、削除で総件数が縮むと実際に到達する。
    let total: number;

    if (error && error.code === SUPABASE_ERROR_CODE.RANGE_NOT_SATISFIABLE) {
      const { count: outOfRangeTotal, error: countError } = await supabase
        .from('favorites')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .is('deleted_at', null);

      if (countError) {
        throw countError;
      }

      total = outOfRangeTotal ?? 0;
    } else if (error) {
      throw error;
    } else {
      total = count ?? 0;
    }

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;

    return NextResponse.json(
      {
        success: true,
        data: {
          favorites: data ?? [],
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            nextPage: hasNextPage ? page + 1 : null,
          },
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Favorites fetch error',
    errorMessage: FAVORITES_ERROR_MESSAGES.FETCH_FAILED,
  },
);

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_FAVORITES,
      RATE_LIMIT_CONFIG.WRITE_FAVORITES.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_FAVORITES.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const parsed = await parseAndValidate(
      request,
      favoritesAddSchema,
      FAVORITES_ERROR_MESSAGES.INVALID_BODY,
    );
    if (parsed.error) return parsed.error;

    // ⚠️ INSERT の前に重複を SELECT しない（#1277）。
    //
    // 重複は部分UNIQUEインデックス
    // （`idx_favorites_user_movie ... WHERE deleted_at IS NULL`）が保証して
    // おり、下の 23505 → 409 で同じ応答を返せる。事前チェックは race も
    // 防げない（だから `isUniqueViolation` がある）ので、**防げない競合の
    // ために成功時も必ず1往復増やしていた**だけだった。
    //
    // お気に入り追加
    const { data: inserted, error: insertError } = await supabase
      .from('favorites')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: parsed.data.tmdb_movie_id,
        title: parsed.data.title,
        poster_path: parsed.data.poster_path ?? null,
        release_date: parsed.data.release_date ?? null,
        rating: parsed.data.rating,
      })
      .select(FAVORITES_SELECT)
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        return conflictResponse(FAVORITES_ERROR_MESSAGES.ALREADY_EXISTS);
      }
      throw insertError;
    }

    // レコメンドがまだ1件も無いユーザーには、その場で生成をキックする。
    // 日次CRONを待つと最大24時間「準備中」のままになるため。
    // レスポンスを待たせないよう after() でバックグラウンド実行する。
    after(() => runInstantRecommendationIfEligible(supabase, session.user.id));

    return NextResponse.json(
      {
        success: true,
        message: FAVORITES_SUCCESS_MESSAGES.ADDED,
        data: inserted,
      },
      { status: HTTP_STATUS.CREATED },
    );
  },
  {
    errorLog: 'Favorites add error',
    errorMessage: FAVORITES_ERROR_MESSAGES.ADD_FAILED,
  },
);
