/**
 * お気に入り照会 カスタムフック
 * 表示中の映画が登録済みか（何点か）をクライアント側で判定する
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import { getFavoriteLookup } from '@/lib/api/favorites/favorites';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
import { favoriteKeys } from '@/constants';

/**
 * useFavoriteLookupフックの返り値
 */
export interface UseFavoriteLookupReturn {
  /** 指定映画のお気に入り情報を取得（未登録ならnull） */
  getFavoriteInfo: (tmdbMovieId: number) => MovieFavoriteInfo | null;
  /** 照会の読み込み中 */
  isLoading: boolean;
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
  const { data: session, status } = useSession();
  // 無効化済みセッションは user が空文字で埋まったオブジェクトとして返るため、
  // 存在確認では判定できない（useFavorites と同じ基準）
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;

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

  return useMemo(
    () => ({
      getFavoriteInfo,
      isLoading: lookupQuery.isLoading,
    }),
    [getFavoriteInfo, lookupQuery.isLoading],
  );
}
