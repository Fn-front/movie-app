/**
 * お気に入り カスタムフック
 * useInfiniteQuery（一覧用）＋ useFavoriteMutations（追加・評価更新・削除）
 *
 * **一覧が要る画面だけで使う**（現状はお気に入りページのみ）。
 * お気に入りボタンを出すだけの画面は `useFavoriteToggle` を使うこと。
 * そちらは一覧を読まないので、無駄な `GET /api/favorites?page=1` が走らない。
 */

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import { getFavorites } from '@/lib/api/favorites/favorites';
import type {
  FavoriteItem,
  GetFavoritesRequest,
} from '@/lib/api/favorites/favorites';
import {
  useFavoriteMutations,
  type UseFavoriteMutationsReturn,
} from '@/features/favorites/hooks/useFavoriteMutations';
import { favoriteKeys } from '@/constants';

/**
 * useFavoritesフックの返り値
 */
export interface UseFavoritesReturn extends UseFavoriteMutationsReturn {
  /** お気に入り一覧 */
  favorites: FavoriteItem[];
  /** 初回読み込み中 */
  isLoading: boolean;
  /** 次ページ読み込み中 */
  isFetchingNextPage: boolean;
  /** 次ページがあるか */
  hasNextPage: boolean;
  /** 次ページを読み込む */
  fetchNextPage: () => void;
}

/**
 * お気に入り カスタムフック
 */
export function useFavorites(params?: GetFavoritesRequest): UseFavoritesReturn {
  const { data: session, status } = useSession();
  // 無効化済みセッション（パスワード変更・絶対期限切れ）は user が
  // 空文字で埋められたオブジェクトとして返るため、存在確認では判定できない。
  // id の有無で見る（getAuthSession と同じ基準）
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;

  const mutations = useFavoriteMutations();

  // お気に入り一覧取得（無限スクロール）
  const favoritesQuery = useInfiniteQuery({
    queryKey: favoriteKeys.list({
      sort_by: params?.sort_by,
      sort_order: params?.sort_order,
    }),
    queryFn: ({ pageParam }) =>
      getFavorites({
        ...params,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.data.pagination.nextPage ?? undefined,
    enabled: isAuthenticated,
  });

  // 全ページのお気に入りを結合
  const favorites = useMemo(
    () =>
      favoritesQuery.data?.pages.flatMap((page) => page.data.favorites) ?? [],
    [favoritesQuery.data],
  );

  const fetchNextPage = useCallback(() => {
    favoritesQuery.fetchNextPage();
  }, [favoritesQuery]);

  return useMemo(
    () => ({
      ...mutations,
      favorites,
      isLoading: favoritesQuery.isLoading,
      isFetchingNextPage: favoritesQuery.isFetchingNextPage,
      hasNextPage: favoritesQuery.hasNextPage,
      fetchNextPage,
    }),
    [
      mutations,
      favorites,
      favoritesQuery.isLoading,
      favoritesQuery.isFetchingNextPage,
      favoritesQuery.hasNextPage,
      fetchNextPage,
    ],
  );
}
