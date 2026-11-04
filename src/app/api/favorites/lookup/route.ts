/**
 * お気に入り照会API
 * GET /api/favorites/lookup - お気に入りのID・映画ID・評価のみを全件取得
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  FAVORITES_LOOKUP_MAX_PAGES,
  FAVORITES_LOOKUP_PAGE_SIZE,
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
 *
 * ただし PostgREST には max_rows による暗黙の上限があるため、内部で
 * ページングして読み切る（下記コメント参照）。
 */
export const GET = withAuth(
  async ({ session, supabase }) => {
    // PostgREST は max_rows（本プロジェクトは 1000 / supabase/config.toml）で
    // 黙って打ち切る。エラーも truncation フラグも返らないため、
    // 絞り込み無しで投げると 1001 件目以降が静かに消え、
    // まさにこのAPIが直した #829 と同じ症状が高い閾値で再発する。
    // 明示的に range で区切り、返ってきた件数で続きの有無を判断する
    const favorites: unknown[] = [];

    for (let page = 0; page < FAVORITES_LOOKUP_MAX_PAGES; page += 1) {
      const from = page * FAVORITES_LOOKUP_PAGE_SIZE;

      const { data, error } = await supabase
        .from('favorites')
        .select(FAVORITES_LOOKUP_SELECT)
        .eq('user_id', session.user.id)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, from + FAVORITES_LOOKUP_PAGE_SIZE - 1);

      if (error) {
        throw error;
      }

      favorites.push(...(data ?? []));

      // 要求した件数に満たなければ最後のページ
      if ((data?.length ?? 0) < FAVORITES_LOOKUP_PAGE_SIZE) {
        return NextResponse.json(
          { success: true, data: { favorites } },
          { status: HTTP_STATUS.OK },
        );
      }
    }

    // 上限まで読み切った。これ以上は読まないが、黙って切るのではなく
    // 気づけるようにしておく（現実的な利用では到達しない）
    console.warn(
      `[favorites-lookup] 取得上限に到達した user=${session.user.id} ` +
        `count=${favorites.length}`,
    );

    return NextResponse.json(
      { success: true, data: { favorites } },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Favorites lookup error',
    errorMessage: FAVORITES_ERROR_MESSAGES.FETCH_FAILED,
  },
);
