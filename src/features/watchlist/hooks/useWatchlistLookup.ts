/**
 * ウォッチリスト照会 カスタムフック
 * 表示中の映画が登録済みか（どの行か）をクライアント側で判定する
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuthStatus } from '@/hooks/useAuthStatus';
import { getWatchlistLookup } from '@/lib/api/watchlist/watchlist';
import { watchlistKeys } from '@/constants';

/**
 * useWatchlistLookupフックの返り値
 */
export interface UseWatchlistLookupReturn {
  /** 指定映画のウォッチリストID を取得（未登録なら undefined） */
  getLookupWatchlistId: (tmdbMovieId: number) => string | undefined;
  /**
   * 登録状況がまだ分からない
   *
   * `getLookupWatchlistId` は「まだ取れていない」と「登録されていない」を
   * どちらも `undefined` で返すため、これが `true` の間は未登録として
   * 描いてはいけない（#1145）。
   *
   * 取得に**失敗**したときは `false`（確定）になる。全作品を未登録として
   * 扱うのが既存の方針なので、失敗を未確定のままにすると描画が止まる
   */
  isResolving: boolean;
}

/**
 * ウォッチリスト照会 カスタムフック
 *
 * 一覧（`useWatchlist`）とはクエリキーを分けている。一覧を埋めているのは
 * サイドバーのパネルで、**公開日が近い未視聴の上位10件**しか読まない。
 * そのキャッシュから登録済みを判定すると、視聴済みの作品と11件目以降が
 * すべて「未登録」になる（#1145）。
 *
 * 取得に失敗しても例外は投げず、全作品を未登録として扱う。登録済みかの
 * 判定が取れないだけで画面自体が見られなくなる方が困るため
 * （お気に入り側の `useFavoriteLookup` と同じ方針）。
 */
export function useWatchlistLookup(): UseWatchlistLookupReturn {
  const { isAuthenticated, isResolving: isSessionResolving } = useAuthStatus();

  const lookupQuery = useQuery({
    queryKey: watchlistKeys.lookup(),
    queryFn: getWatchlistLookup,
    enabled: isAuthenticated,
  });

  const watchlistIdMap = useMemo(() => {
    const items = lookupQuery.data?.data.watchlist ?? [];
    return new Map(items.map((item) => [item.tmdb_movie_id, item.id]));
  }, [lookupQuery.data]);

  const getLookupWatchlistId = useCallback(
    (tmdbMovieId: number): string | undefined =>
      watchlistIdMap.get(tmdbMovieId),
    [watchlistIdMap],
  );

  // 取得に失敗したら確定として扱う（`isLoading` はエラー時 false になる）。
  // 未認証ならクエリは無効のままなので、セッションが確定した時点で確定
  const isResolving =
    isSessionResolving || (isAuthenticated && lookupQuery.isLoading);

  return useMemo(
    () => ({ getLookupWatchlistId, isResolving }),
    [getLookupWatchlistId, isResolving],
  );
}
