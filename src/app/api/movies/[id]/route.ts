/**
 * 映画詳細API
 * GET /api/movies/:id
 * 未認証時はCDNキャッシュ、認証時はprivate（favorite情報を含むため）
 */

import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';

import { getAuthSession } from '@/helpers/auth';
import { createServiceRoleClient } from '@/helpers/supabase';
import { enforcePublicRateLimit } from '@/helpers/publicRateLimit';
import { getMovieDetail } from '@/lib/tmdb/tmdb';
import {
  HTTP_STATUS,
  ERROR_CODE,
  MOVIES_ERROR_MESSAGES,
  API_ERROR_MESSAGES,
  CACHE_CONTROL,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';

/**
 * 映画詳細を取得
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const movieId = Number(id);

    if (Number.isNaN(movieId) || movieId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: MOVIES_ERROR_MESSAGES.INVALID_MOVIE_ID,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 認証判定を TMDb 呼び出しより前に行う。
    // 識別子にユーザーIDを使うため（NAT で同一IPを共有する利用者を
    // まとめて巻き込まないため）、レート制限より先に必要になる
    const session = await getAuthSession();

    // 未認証で叩ける＝サーバーの TMDB_API_KEY を使った無認証プロキシになるため、
    // TMDb を呼ぶ前に上限を掛ける。不正なIDは上の400で弾いており枠を消費しない
    const limited = await enforcePublicRateLimit({
      request,
      action: RATE_LIMIT_ACTION.READ_MOVIE_DETAIL,
      limit: RATE_LIMIT_CONFIG.READ_MOVIE_DETAIL,
      userId: session?.user?.id,
    });
    if (limited) return limited;

    const movie = await getMovieDetail(movieId);

    // 認証済みの場合、お気に入り情報を付与
    let favorite = undefined;

    if (session) {
      const supabase = createServiceRoleClient();

      if (supabase) {
        const { data: favoriteData } = await supabase
          .from('favorites')
          .select('id, rating')
          .eq('user_id', session.user.id)
          .eq('tmdb_movie_id', movieId)
          .is('deleted_at', null)
          .single();

        favorite = favoriteData ?? null;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...movie,
          ...(favorite !== undefined ? { favorite } : {}),
        },
      },
      {
        headers: {
          'Cache-Control': session
            ? CACHE_CONTROL.PRIVATE_NO_STORE
            : CACHE_CONTROL.PUBLIC_24H_SWR_7D,
        },
      },
    );
  } catch (error) {
    if (
      isAxiosError(error) &&
      error.response?.status === HTTP_STATUS.NOT_FOUND
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.NOT_FOUND,
            message: MOVIES_ERROR_MESSAGES.NOT_FOUND,
          },
        },
        { status: HTTP_STATUS.NOT_FOUND },
      );
    }

    console.error('映画詳細取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: API_ERROR_MESSAGES.SERVER_ERROR,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
