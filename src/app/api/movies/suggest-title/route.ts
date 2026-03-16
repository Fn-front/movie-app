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
} from '@/constants';
import { titleSuggestionQuerySchema } from '@/schema/titleSuggestion';
import { fetchTitleSuggestionFromOpenAI } from '@/lib/openai/suggestTitle';

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

    // 4. キャッシュ確認（suggested_titleがnullの場合も「提案なし」としてキャッシュヒット）
    const { data: cached, error: cacheError } = await supabase
      .from('title_suggestions')
      .select('suggested_title')
      .eq('query_title', query)
      .single();

    if (!cacheError && cached) {
      return NextResponse.json(
        {
          success: true,
          data: {
            suggestion: cached.suggested_title,
            cached: true,
          },
        },
        { status: HTTP_STATUS.OK },
      );
    }

    // 5. OpenAI APIで原題を推測
    const suggestedTitle = await fetchTitleSuggestionFromOpenAI(query);

    // 6. DBにキャッシュ保存（提案なしの場合もnullで保存し、再度のAPI呼び出しを防ぐ）
    await supabase.from('title_suggestions').upsert(
      {
        query_title: query,
        suggested_title: suggestedTitle,
      },
      { onConflict: 'query_title' },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          suggestion: suggestedTitle,
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
