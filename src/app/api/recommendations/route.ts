/**
 * レコメンド取得API
 * GET /api/recommendations
 *
 * 認証済みユーザーの自分のレコメンドをdisplay_order順で取得する。
 * レコメンドが未生成の場合は空配列 + generated_at: null を返す。
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { HTTP_STATUS, ERROR_CODE, errorMessage } from '@/constants';

const TARGET = 'レコメンド';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const { data, error } = await supabase
      .from('recommendations')
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, vote_average, genre_ids, reason, display_order, generated_at',
      )
      .eq('user_id', session.user.id)
      .order('display_order', { ascending: true });

    if (error) {
      throw error;
    }

    const recommendations = data ?? [];
    const generatedAt =
      recommendations.length > 0
        ? (recommendations[0].generated_at as string)
        : null;

    return NextResponse.json(
      {
        success: true,
        data: {
          recommendations,
          generated_at: generatedAt,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Recommendations fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: errorMessage.fetchFailed(TARGET),
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
