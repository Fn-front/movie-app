/**
 * お気に入り照会 カスタムフック
 * 表示中の映画が登録済みか（何点か）をクライアント側で判定する
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuthStatus } from '@/hooks/useAuthStatus';
import { getFavoriteLookup } from '@/lib/api/favorites/favorites';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
import { favoriteKeys } from '@/constants';

/**
 * useFavoriteLookupフックの返り値
 */
export interface UseFavoriteLookupReturn {
  /** 指定映画のお気に入り情報を取得（未登録ならnull） */
  getFavoriteInfo: (tmdbMovieId: number) => MovieFavoriteInfo | null;
  /**
   * 登録状況がまだ分からない
   *
   * `getFavoriteInfo` は「まだ取れていない」と「登録されていない」を
   * どちらも `null` で返すため、これが `true` の間は未登録として
   * 描いてはいけない（#1135）。
   *
   * 取得に**失敗**したときは `false`（確定）になる。全作品を未登録として
   * 扱うのが既存の方針なので、失敗を未確定のままにすると描画が止まる
   */
  isResolving: boolean;
}

/**
 * お気に入り照会 カスタムフック
 *
 * 一覧（`useFavorites`）とはクエリキーを分けている。一覧は無限スクロールで
 * 1ページ20件ずつしか読まないため、一覧の配列から登録済みを判定すると
 * 21件目以降が取りこぼされる（#829）。
 *
 * 取得に失敗しても例外は投げず、全作品を未登録として扱う。お気に入りの
 * 判定が取れないだけで画面自体が見られなくなる方が困るため。
 */
export function useFavoriteLookup(): UseFavoriteLookupReturn {
  const { isAuthenticated, isResolving: isSessionResolving } = useAuthStatus();

  const lookupQuery = useQuery({
    queryKey: favoriteKeys.lookup(),
    queryFn: getFavoriteLookup,
    enabled: isAuthenticated,
  });

  const favoriteMap = useMemo(() => {
    const items = lookupQuery.data?.data.favorites ?? [];
    return new Map(
      items.map((item) => [
        item.tmdb_movie_id,
        { id: item.id, rating: item.rating },
      ]),
    );
  }, [lookupQuery.data]);

  const getFavoriteInfo = useCallback(
    (tmdbMovieId: number): MovieFavoriteInfo | null =>
      favoriteMap.get(tmdbMovieId) ?? null,
    [favoriteMap],
  );

  // 取得に失敗したら確定として扱う（`isLoading` はエラー時 false になる）。
  // 未認証ならクエリは無効のままなので、セッションが確定した時点で確定
  const isResolving =
    isSessionResolving || (isAuthenticated && lookupQuery.isLoading);

  return useMemo(
    () => ({ getFavoriteInfo, isResolving }),
    [getFavoriteInfo, isResolving],
  );
}
