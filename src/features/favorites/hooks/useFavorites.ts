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

import { useAuthStatus } from '@/hooks/useAuthStatus';
import { getFavorites } from '@/lib/api/favorites/favorites';
import type {
  FavoriteItem,
  GetFavoritesRequest,
} from '@/lib/api/favorites/favorites';
import {
  useFavoriteMutations,
  type UseFavoriteMutationsReturn,
} from '@/features/favorites/hooks/useFavoriteMutations';
import { favoriteKeys, FAVORITES_MAX_CACHED_PAGES } from '@/constants';

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
  /** 前ページ読み込み中 */
  isFetchingPreviousPage: boolean;
  /**
   * 前ページがあるか
   *
   * `maxPages` で先頭ページが捨てられたときに true になる。
   * 捨てられたページを取り直す導線が無いと、画面に出ていた項目が消える（#972）
   */
  hasPreviousPage: boolean;
  /** 前ページを読み込む */
  fetchPreviousPage: () => void;
}

/**
 * お気に入り カスタムフック
 */
export function useFavorites(params?: GetFavoritesRequest): UseFavoritesReturn {
  const { isAuthenticated, isResolving } = useAuthStatus();

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
    // 上方向。`maxPages` を効かせるには双方向である必要がある（#972）
    getPreviousPageParam: (firstPage) => {
      const { currentPage } = firstPage.data.pagination;
      return currentPage > 1 ? currentPage - 1 : undefined;
    },
    // 保持ページ数の上限。無制限だと invalidate のたびに読み込み済みの
    // 全ページを順に取り直す。お気に入りは実質 append-only（実測で削除率
    // 1.5%）で増え続けるため、年単位で見ると1操作あたりのリクエストが
    // 無視できなくなる
    maxPages: FAVORITES_MAX_CACHED_PAGES,
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

  const fetchPreviousPage = useCallback(() => {
    favoritesQuery.fetchPreviousPage();
  }, [favoritesQuery]);

  return useMemo(
    () => ({
      ...mutations,
      favorites,
      // セッション未確定で、まだ何も無いときは読み込み中として返す。
      // react-query は無効化中のクエリの isLoading を false にするため、
      // 素通しすると「0件が確定した」ように見えて空メッセージが先に出る（#1132）。
      //
      // 件数を条件に入れるのは、`useSession().update()`（表示名の保存など）が
      // status を loading へ戻すため。無条件だと埋まっている一覧が
      // スケルトンに化ける
      isLoading:
        (isResolving && favorites.length === 0) || favoritesQuery.isLoading,
      isFetchingNextPage: favoritesQuery.isFetchingNextPage,
      hasNextPage: favoritesQuery.hasNextPage,
      fetchNextPage,
      isFetchingPreviousPage: favoritesQuery.isFetchingPreviousPage,
      hasPreviousPage: favoritesQuery.hasPreviousPage,
      fetchPreviousPage,
    }),
    [
      mutations,
      favorites,
      isResolving,
      favoritesQuery.isLoading,
      favoritesQuery.isFetchingNextPage,
      favoritesQuery.hasNextPage,
      fetchNextPage,
      favoritesQuery.isFetchingPreviousPage,
      favoritesQuery.hasPreviousPage,
      fetchPreviousPage,
    ],
  );
}
