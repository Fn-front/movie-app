/**
 * お気に入り カスタムフック
 * useQuery（一覧用）、useMutation（追加・評価更新・削除、楽観的UI更新）
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import {
  getFavorites,
  addFavorite,
  updateFavoriteRating,
  removeFavorite,
} from '@/lib/api/favorites/favorites';
import type {
  GetFavoritesRequest,
  GetFavoritesResponse,
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
  /** お気に入り一覧取得（/favoritesページ用） */
  favorites: GetFavoritesResponse['data'] | undefined;
  /** 読み込み中 */
  isLoading: boolean;
  /** お気に入りに追加 */
  addToFavorites: (data: FavoritesAddFormData) => void;
  /** 評価を更新 */
  updateRating: (id: string, rating: number) => void;
  /** お気に入りから削除 */
  removeFromFavorites: (id: string) => void;
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
export function useFavorites(
  params?: GetFavoritesRequest,
): UseFavoritesReturn {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // お気に入り一覧取得
  const favoritesQuery = useQuery({
    queryKey: favoriteKeys.list({
      sort_by: params?.sort_by,
      sort_order: params?.sort_order,
    }),
    queryFn: () => getFavorites(params),
    enabled: isAuthenticated,
  });

  // 映画一覧キャッシュ内のfavoriteフィールドを更新するユーティリティ
  const updateMovieCacheFavorite = useCallback(
    (tmdbMovieId: number, favorite: MovieFavoriteInfo | null) => {
      queryClient.setQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: {
              ...page.data,
              movies: page.data.movies.map((movie) =>
                movie.id === tmdbMovieId ? { ...movie, favorite } : movie,
              ),
            },
          })),
        };
      });
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

      // 映画一覧キャッシュからtmdbMovieIdを探して楽観的更新
      queryClient.setQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: {
              ...page.data,
              movies: page.data.movies.map((movie) =>
                movie.favorite?.id === id
                  ? { ...movie, favorite: { id, rating } }
                  : movie,
              ),
            },
          })),
        };
      });

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

      // 映画一覧キャッシュからfavoriteをnullに設定
      queryClient.setQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: {
              ...page.data,
              movies: page.data.movies.map((movie) =>
                movie.favorite?.id === id
                  ? { ...movie, favorite: null }
                  : movie,
              ),
            },
          })),
        };
      });

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

  return useMemo(
    () => ({
      favorites: favoritesQuery.data?.data,
      isLoading: favoritesQuery.isLoading,
      addToFavorites,
      updateRating,
      removeFromFavorites,
      isAdding: addMutation.isPending,
      isUpdating: updateMutation.isPending,
      isRemoving: removeMutation.isPending,
    }),
    [
      favoritesQuery.data,
      favoritesQuery.isLoading,
      addToFavorites,
      updateRating,
      removeFromFavorites,
      addMutation.isPending,
      updateMutation.isPending,
      removeMutation.isPending,
    ],
  );
}
