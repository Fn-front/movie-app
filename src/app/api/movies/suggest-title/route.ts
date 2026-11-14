/**
 * 原題提案API
 * GET /api/movies/suggest-title?query=邦題
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  HTTP_STATUS,
  ERROR_CODE,
  TITLE_SUGGESTION_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  SUPABASE_ERROR_CODE,
} from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { titleSuggestionQuerySchema } from '@/schema/titleSuggestion';
import { fetchTitleSuggestionsFromOpenAI } from '@/lib/openai/suggestTitle';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

export async function GET(request: Request) {
  try {
    // 1. 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // 2. バリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = titleSuggestionQuerySchema.safeParse({
      query: searchParams.get('query'),
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: TITLE_SUGGESTION_ERROR_MESSAGES.VALIDATION_ERROR,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { query } = queryResult.data;

    // 3. DB接続
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 4. キャッシュ確認（空配列の場合も「提案なし」としてキャッシュヒット）
    const { data: cached, error: cacheError } = await supabase
      .from('title_suggestions')
      .select('suggestions')
      .eq('query_title', query)
      .single();

    // ⚠️ 読み取り失敗を「キャッシュミス」に倒さない。下の OpenAI 呼び出しは
    // 課金が発生するうえ、レートリミットの消費もここより後ろなので、DB が
    // 詰まっている間は枠を使い切るまで呼び続けることになる。守っている資源が
    // 費用である以上、読めないなら止める（#1164）。
    // 行が無い（PGRST116）＝本当に未キャッシュは従来どおり OpenAI へ進む
    if (cacheError && cacheError.code !== SUPABASE_ERROR_CODE.NOT_FOUND) {
      throw cacheError;
    }

    // 上のガードを抜けた時点で cacheError は NOT_FOUND だけ（そのとき
    // cached は null）なので、`!cacheError &&` は恒真になる。残すと
    // 「エラーがあっても cached が入りうる」と誤読させるので落とす
    if (cached) {
      return NextResponse.json(
        {
          success: true,
          data: {
            suggestions: cached.suggestions,
            cached: true,
          },
        },
        { status: HTTP_STATUS.OK },
      );
    }

    // 5. レートリミットチェック
    //
    // このルートだけ検証より後ろにある。守っているのは DB ではなく OpenAI の
    // 呼び出し費用で、キャッシュヒットなら費用が発生しないため消費させない。
    // キャッシュの照合には検証済みの query が要るので、前には出せない
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」の例外2）
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.SUGGEST_TITLE,
      RATE_LIMIT_CONFIG.SUGGEST_TITLE.maxAttempts,
      RATE_LIMIT_CONFIG.SUGGEST_TITLE.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          },
        },
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: rateLimitResult.retryAfter
            ? { 'Retry-After': String(rateLimitResult.retryAfter) }
            : undefined,
        },
      );
    }

    // 6. OpenAI APIで原題候補を推測
    const suggestions = await fetchTitleSuggestionsFromOpenAI(query);

    // 7. DBにキャッシュ保存（空配列も保存し、再度のAPI呼び出しを防ぐ）
    await supabase.from('title_suggestions').upsert(
      {
        query_title: query,
        suggestions,
      },
      { onConflict: 'query_title' },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          suggestions,
          cached: false,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Title suggestion API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: TITLE_SUGGESTION_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
