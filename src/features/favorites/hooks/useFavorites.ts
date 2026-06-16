/**
 * お気に入り カスタムフック
 * useInfiniteQuery（一覧用）、useMutation（追加・評価更新・削除、楽観的UI更新）
 */

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import {
  getFavorites,
  addFavorite,
  updateFavoriteRating,
  removeFavorite,
} from '@/lib/api/favorites/favorites';
import type {
  FavoriteItem,
  GetFavoritesRequest,
  MovieFavoriteInfo,
} from '@/lib/api/favorites/favorites';
import type { FavoritesAddFormData } from '@/schema/favorites';
import { useToast } from '@/hooks/useToast';
import {
  favoriteKeys,
  movieKeys,
  FAVORITES_ERROR_MESSAGES,
  FAVORITES_SUCCESS_MESSAGES,
} from '@/constants';
import type { GetMoviesResponse } from '@/lib/api/movies/movies';

/**
 * useFavoritesフックの返り値
 */
export interface UseFavoritesReturn {
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
  /** お気に入りに追加 */
  addToFavorites: (data: FavoritesAddFormData) => void;
  /** 評価を更新 */
  updateRating: (id: string, rating: number) => void;
  /** お気に入りから削除 */
  removeFromFavorites: (id: string) => void;
  /** 指定映画のお気に入り情報を取得（未登録ならnull） */
  getFavoriteInfo: (tmdbMovieId: number) => MovieFavoriteInfo | null;
  /** 追加中 */
  isAdding: boolean;
  /** 更新中 */
  isUpdating: boolean;
  /** 削除中 */
  isRemoving: boolean;
}

/**
 * お気に入り カスタムフック
 */
export function useFavorites(params?: GetFavoritesRequest): UseFavoritesReturn {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  // 映画関連キャッシュ内のfavoriteフィールドを更新するユーティリティ
  // movieKeys.all (= ['movies']) は一覧 (pages 構造) と詳細 ({ data: MovieDetail } 構造)
  // の両方にマッチするため、構造を判別して適切に更新する
  const updateMovieCacheFavorite = useCallback(
    (tmdbMovieId: number, favorite: MovieFavoriteInfo | null) => {
      queryClient.setQueriesData(
        { queryKey: movieKeys.all },
        (old: unknown) => {
          if (!old || typeof old !== 'object') return old;

          // 一覧キャッシュ (useInfiniteQuery: { pages, pageParams })
          const list = old as {
            pages?: GetMoviesResponse[];
            pageParams?: number[];
          };
          if (Array.isArray(list.pages)) {
            return {
              ...list,
              pages: list.pages.map((page) => {
                if (!page?.data?.movies) return page;
                return {
                  ...page,
                  data: {
                    ...page.data,
                    movies: page.data.movies.map((movie) =>
                      movie.id === tmdbMovieId ? { ...movie, favorite } : movie,
                    ),
                  },
                };
              }),
            };
          }

          // 詳細キャッシュ (useQuery: { success, data: MovieDetail })
          const detail = old as { data?: { id?: number } };
          if (detail.data?.id === tmdbMovieId) {
            return { ...detail, data: { ...detail.data, favorite } };
          }

          return old;
        },
      );
    },
    [queryClient],
  );

  // 追加mutation（楽観的UI更新）
  const addMutation = useMutation({
    mutationFn: addFavorite,
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: movieKeys.all });

      // 映画一覧キャッシュの現在値を保存
      const previousMoviesCache = queryClient.getQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all });

      // 楽観的に映画一覧キャッシュを更新
      updateMovieCacheFavorite(newItem.tmdb_movie_id, {
        id: `optimistic-${Date.now()}`,
        rating: newItem.rating,
      });

      return { previousMoviesCache };
    },
    onSuccess: (response) => {
      // 楽観的IDを実際のIDで上書き
      updateMovieCacheFavorite(response.data.tmdb_movie_id, {
        id: response.data.id,
        rating: response.data.rating,
      });
      toast({
        title: FAVORITES_SUCCESS_MESSAGES.ADDED,
        variant: 'success',
      });
    },
    onError: (_error, _newItem, context) => {
      if (context?.previousMoviesCache) {
        for (const [key, data] of context.previousMoviesCache) {
          queryClient.setQueryData(key, data);
        }
      }
      toast({
        title: 'エラー',
        description: FAVORITES_ERROR_MESSAGES.ADD_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });

  // 評価更新mutation（楽観的UI更新）
  const updateMutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) =>
      updateFavoriteRating(id, { rating }),
    onMutate: async ({ id, rating }) => {
      await queryClient.cancelQueries({ queryKey: movieKeys.all });

      const previousMoviesCache = queryClient.getQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all });

      // 映画関連キャッシュからお気に入りIDを探して楽観的更新（一覧＋詳細）
      queryClient.setQueriesData(
        { queryKey: movieKeys.all },
        (old: unknown) => {
          if (!old || typeof old !== 'object') return old;

          const list = old as {
            pages?: GetMoviesResponse[];
            pageParams?: number[];
          };
          if (Array.isArray(list.pages)) {
            return {
              ...list,
              pages: list.pages.map((page) => {
                if (!page?.data?.movies) return page;
                return {
                  ...page,
                  data: {
                    ...page.data,
                    movies: page.data.movies.map((movie) =>
                      movie.favorite?.id === id
                        ? { ...movie, favorite: { id, rating } }
                        : movie,
                    ),
                  },
                };
              }),
            };
          }

          const detail = old as {
            data?: { favorite?: { id?: string } | null };
          };
          if (detail.data?.favorite?.id === id) {
            return {
              ...detail,
              data: { ...detail.data, favorite: { id, rating } },
            };
          }

          return old;
        },
      );

      return { previousMoviesCache };
    },
    onSuccess: () => {
      toast({
        title: FAVORITES_SUCCESS_MESSAGES.UPDATED,
        variant: 'success',
      });
    },
    onError: (_error, _vars, context) => {
      if (context?.previousMoviesCache) {
        for (const [key, data] of context.previousMoviesCache) {
          queryClient.setQueryData(key, data);
        }
      }
      toast({
        title: 'エラー',
        description: FAVORITES_ERROR_MESSAGES.UPDATE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });

  // 削除mutation（楽観的UI更新）
  const removeMutation = useMutation({
    mutationFn: removeFavorite,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: movieKeys.all });

      const previousMoviesCache = queryClient.getQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all });

      // 映画関連キャッシュからお気に入りをnullに設定（一覧＋詳細）
      queryClient.setQueriesData(
        { queryKey: movieKeys.all },
        (old: unknown) => {
          if (!old || typeof old !== 'object') return old;

          const list = old as {
            pages?: GetMoviesResponse[];
            pageParams?: number[];
          };
          if (Array.isArray(list.pages)) {
            return {
              ...list,
              pages: list.pages.map((page) => {
                if (!page?.data?.movies) return page;
                return {
                  ...page,
                  data: {
                    ...page.data,
                    movies: page.data.movies.map((movie) =>
                      movie.favorite?.id === id
                        ? { ...movie, favorite: null }
                        : movie,
                    ),
                  },
                };
              }),
            };
          }

          const detail = old as {
            data?: { favorite?: { id?: string } | null };
          };
          if (detail.data?.favorite?.id === id) {
            return { ...detail, data: { ...detail.data, favorite: null } };
          }

          return old;
        },
      );

      return { previousMoviesCache };
    },
    onSuccess: () => {
      toast({
        title: FAVORITES_SUCCESS_MESSAGES.REMOVED,
        variant: 'success',
      });
    },
    onError: (_error, _id, context) => {
      if (context?.previousMoviesCache) {
        for (const [key, data] of context.previousMoviesCache) {
          queryClient.setQueryData(key, data);
        }
      }
      toast({
        title: 'エラー',
        description: FAVORITES_ERROR_MESSAGES.REMOVE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });

  // 全ページのお気に入りを結合
  const favorites = useMemo(
    () =>
      favoritesQuery.data?.pages.flatMap((page) => page.data.favorites) ?? [],
    [favoritesQuery.data],
  );

  const addToFavorites = useCallback(
    (data: FavoritesAddFormData) => {
      addMutation.mutate(data);
    },
    [addMutation],
  );

  const updateRating = useCallback(
    (id: string, rating: number) => {
      updateMutation.mutate({ id, rating });
    },
    [updateMutation],
  );

  const removeFromFavorites = useCallback(
    (id: string) => {
      removeMutation.mutate(id);
    },
    [removeMutation],
  );

  const getFavoriteInfo = useCallback(
    (tmdbMovieId: number): MovieFavoriteInfo | null => {
      const item = favorites.find((f) => f.tmdb_movie_id === tmdbMovieId);
      if (!item) return null;
      return { id: item.id, rating: item.rating };
    },
    [favorites],
  );

  const fetchNextPage = useCallback(() => {
    favoritesQuery.fetchNextPage();
  }, [favoritesQuery]);

  return useMemo(
    () => ({
      favorites,
      isLoading: favoritesQuery.isLoading,
      isFetchingNextPage: favoritesQuery.isFetchingNextPage,
      hasNextPage: favoritesQuery.hasNextPage,
      fetchNextPage,
      addToFavorites,
      updateRating,
      removeFromFavorites,
      getFavoriteInfo,
      isAdding: addMutation.isPending,
      isUpdating: updateMutation.isPending,
      isRemoving: removeMutation.isPending,
    }),
    [
      favorites,
      favoritesQuery.isLoading,
      favoritesQuery.isFetchingNextPage,
      favoritesQuery.hasNextPage,
      fetchNextPage,
      addToFavorites,
      updateRating,
      removeFromFavorites,
      getFavoriteInfo,
      addMutation.isPending,
      updateMutation.isPending,
      removeMutation.isPending,
    ],
  );
}
