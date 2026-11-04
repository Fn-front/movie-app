/**
 * お気に入り照会API
 * GET /api/favorites/lookup - お気に入りのID・映画ID・評価のみを全件取得
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  FAVORITES_LOOKUP_SELECT,
  FAVORITES_ERROR_MESSAGES,
} from '@/constants';
import { withAuth } from '@/helpers/routeHandler';

/**
 * お気に入り照会API
 *
 * 一覧API（`GET /api/favorites`）と違い、**ページングしない**。
 *
 * 検索結果・人物の出演作・おすすめ・受賞作品・ウォッチリストは、表示中の作品が
 * お気に入り登録済みかをクライアント側で判定している。一覧APIは1ページ20件で、
 * これらの画面には次ページを読む導線が無いため、21件目以降のお気に入りが
 * 「未登録」と判定されていた（#829）。
 *
 * 返すのは id・tmdb_movie_id・rating の3列だけなので、全件返しても
 * 1件あたり数十バイトに収まる。画面ごとに表示中のIDで絞り込む案も検討したが、
 * ページ送りや無限スクロールのたびにクエリキーが変わって再取得が走り、
 * その間だけ評価が消えて見えるため採らなかった。
 */
export const GET = withAuth(
  async ({ session, supabase }) => {
    const { data, error } = await supabase
      .from('favorites')
      .select(FAVORITES_LOOKUP_SELECT)
      .eq('user_id', session.user.id)
      .is('deleted_at', null);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          favorites: data ?? [],
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Favorites lookup error',
    errorMessage: FAVORITES_ERROR_MESSAGES.FETCH_FAILED,
  },
);
