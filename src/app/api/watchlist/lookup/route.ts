/**
 * ウォッチリスト照会API
 * GET /api/watchlist/lookup - ウォッチリストのID・映画IDのみを全件取得
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  WATCHLIST_LOOKUP_MAX_PAGES,
  WATCHLIST_LOOKUP_PAGE_SIZE,
  WATCHLIST_LOOKUP_SELECT,
  WATCHLIST_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { withAuth } from '@/helpers/routeHandler';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

/**
 * ウォッチリスト照会API
 *
 * 一覧API（`GET /api/watchlist`）と違い、**ページングも絞り込みもしない**。
 *
 * 検索結果・人物の出演作・おすすめ・受賞作品・公開中/公開予定は、表示中の作品が
 * ウォッチリスト登録済みかをクライアント側で判定している。その判定材料は
 * サイドバーのパネルが読んだキャッシュだけで、パネルは
 * **公開日が近い未視聴の上位10件**しか読まない。そのため視聴済みの作品と
 * 11件目以降が「未登録」と判定され、「＋」のまま表示されていた（#1145）。
 *
 * 返すのは id・tmdb_movie_id の2列だけなので、全件返しても1件あたり
 * 数十バイトに収まる。お気に入り側は同じ問題を同じ形で先に解決している
 * （`src/app/api/favorites/lookup/route.ts` / #829）。
 *
 * ⚠️ **`watched_at` で絞らない。** 視聴済みでもウォッチリストには載っている
 * ので、登録済みとして扱う。ここで絞るとパネルと同じ穴を作り直すことになる。
 */
export const GET = withAuth(
  async ({ session, supabase }) => {
    // レート制限チェック。
    // 1リクエストで最大 WATCHLIST_LOOKUP_MAX_PAGES 回 DB を読むため、
    // 無制限だと他の読み取りより負荷が大きい（favorites/lookup と同じ扱い）
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

    // PostgREST は max_rows（本プロジェクトは 1000 / supabase/config.toml）で
    // 黙って打ち切る。エラーも truncation フラグも返らないため、
    // 絞り込み無しで投げると 1001 件目以降が静かに消え、
    // まさにこのAPIが直した症状が高い閾値で再発する。
    // 明示的に range で区切り、返ってきた件数で続きの有無を判断する
    const watchlist: unknown[] = [];

    for (let page = 0; page < WATCHLIST_LOOKUP_MAX_PAGES; page += 1) {
      const from = page * WATCHLIST_LOOKUP_PAGE_SIZE;

      const { data, error } = await supabase
        .from('watchlist')
        .select(WATCHLIST_LOOKUP_SELECT)
        .eq('user_id', session.user.id)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, from + WATCHLIST_LOOKUP_PAGE_SIZE - 1);

      if (error) {
        throw error;
      }

      watchlist.push(...(data ?? []));

      // 要求した件数に満たなければ最後のページ
      if ((data?.length ?? 0) < WATCHLIST_LOOKUP_PAGE_SIZE) {
        return NextResponse.json(
          { success: true, data: { watchlist } },
          { status: HTTP_STATUS.OK },
        );
      }
    }

    // 上限まで読み切った。これ以上は読まないが、黙って切るのではなく
    // 気づけるようにしておく（現実的な利用では到達しない）
    console.warn(
      `[watchlist-lookup] 取得上限に到達した user=${session.user.id} ` +
        `count=${watchlist.length}`,
    );

    return NextResponse.json(
      { success: true, data: { watchlist } },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist lookup error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.FETCH_FAILED,
  },
);
