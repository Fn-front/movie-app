/**
 * 人物詳細API
 * GET /api/person/:id
 *
 * ユーザー固有の情報を一切返さないため、認証有無で Cache-Control を分岐しない
 * （`/api/movies/:id` が分岐しているのは favorite をレスポンスに混ぜるため）。
 * 出演作のお気に入り・ウォッチリスト状態はクライアント側が別途保持する。
 */

import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';

import { getAuthSession } from '@/helpers/auth';
import { enforcePublicRateLimit } from '@/helpers/publicRateLimit';
import { getCachedPersonDetail } from '@/lib/api/person/person.server';
import { parsePersonId } from '@/lib/person/personId';
import {
  HTTP_STATUS,
  ERROR_CODE,
  PERSON_ERROR_MESSAGES,
  API_ERROR_MESSAGES,
  CACHE_CONTROL,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';

/** 人物が見つからないときの 404 レスポンス */
function notFoundResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.NOT_FOUND,
        message: PERSON_ERROR_MESSAGES.NOT_FOUND,
      },
    },
    { status: HTTP_STATUS.NOT_FOUND },
  );
}

/**
 * 人物詳細を取得
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const personId = parsePersonId(id);

    if (personId === null) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: PERSON_ERROR_MESSAGES.INVALID_PERSON_ID,
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
      action: RATE_LIMIT_ACTION.READ_PERSON_DETAIL,
      limit: RATE_LIMIT_CONFIG.READ_PERSON_DETAIL,
      userId: session?.user?.id,
    });
    if (limited) return limited;

    const person = await getCachedPersonDetail(personId);

    // アダルト作品の出演者は存在しない扱いにする。
    // TMDb の include_adult は /search と /discover でしか効かないため、
    // /person/{id} では自前で弾く必要がある
    if (person.adult) {
      return notFoundResponse();
    }

    return NextResponse.json(
      { success: true, data: person },
      { headers: { 'Cache-Control': CACHE_CONTROL.PUBLIC_24H_SWR_7D } },
    );
  } catch (error) {
    if (
      isAxiosError(error) &&
      error.response?.status === HTTP_STATUS.NOT_FOUND
    ) {
      return notFoundResponse();
    }

    console.error('人物詳細取得エラー:', error);
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
