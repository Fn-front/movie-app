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
import { AxiosError } from 'axios';

import {
  getFavorites,
  addFavorite,
  updateFavoriteRating,
  removeFavorite,
} from '@/lib/api/favorites/favorites';
import type {
  FavoriteItem,
  FavoriteLookupItem,
  GetFavoriteLookupResponse,
  GetFavoritesRequest,
  MovieFavoriteInfo,
} from '@/lib/api/favorites/favorites';
import type { FavoritesAddFormData } from '@/schema/favorites';
import { useToast } from '@/hooks/useToast';
import {
  favoriteKeys,
  movieKeys,
  HTTP_STATUS,
  FAVORITES_ERROR_MESSAGES,
  FAVORITES_SUCCESS_MESSAGES,
} from '@/constants';
import type { GetMoviesResponse } from '@/lib/api/movies/movies';

/**
 * 他タブなどで先に登録されていて重複エラー（409）になったかどうか
 *
 * クライアントは自分が知っている状態でしか判断できないため、この経路は
 * 原理的に残る。汎用の「追加に失敗しました」だけだと何が起きたのか
 * 伝わらないので、文言を分けて onSettled の再取得で表示を追従させる
 */
function isConflictError(error: unknown): boolean {
  return (
    error instanceof AxiosError &&
    error.response?.status === HTTP_STATUS.CONFLICT
  );
}

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
  // 無効化済みセッション（パスワード変更・絶対期限切れ）は user が
  // 空文字で埋められたオブジェクトとして返るため、存在確認では判定できない。
  // id の有無で見る（getAuthSession と同じ基準）
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;
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

  // お気に入り照会キャッシュ（favoriteKeys.lookup）の更新ユーティリティ
  //
  // 照会は一覧とは別キーなので movieKeys.all の楽観的更新では追従しない。
  // ここを更新しないと、評価を付けた直後に検索結果・受賞作品・ウォッチリストの
  // 表示が再取得1往復ぶん遅れる
  const updateLookupCache = useCallback(
    (updater: (items: FavoriteLookupItem[]) => FavoriteLookupItem[]) => {
      queryClient.setQueryData<GetFavoriteLookupResponse>(
        favoriteKeys.lookup(),
        (old) =>
          old
            ? {
                ...old,
                data: { ...old.data, favorites: updater(old.data.favorites) },
              }
            : old,
      );
    },
    [queryClient],
  );

  // 失敗時に巻き戻せるよう、書き換える前の照会キャッシュを控える
  const snapshotLookupCache = useCallback(
    () =>
      queryClient.getQueryData<GetFavoriteLookupResponse>(
        favoriteKeys.lookup(),
      ),
    [queryClient],
  );

  const restoreLookupCache = useCallback(
    (previous: GetFavoriteLookupResponse | undefined) => {
      // 未取得（undefined）だったときは楽観的更新も行われていないため戻さない
      if (!previous) return;
      queryClient.setQueryData(favoriteKeys.lookup(), previous);
    },
    [queryClient],
  );

  // 追加mutation（楽観的UI更新）
  const addMutation = useMutation({
    mutationFn: addFavorite,
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: movieKeys.all });
      await queryClient.cancelQueries({ queryKey: favoriteKeys.lookup() });

      // 映画一覧キャッシュの現在値を保存
      const previousMoviesCache = queryClient.getQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all });
      const previousLookup = snapshotLookupCache();

      // サーバーが採番するまでの仮ID。一覧・照会の両方で同じ値を使い、
      // onSuccess でまとめて実際のIDに差し替える
      const optimisticId = `optimistic-${Date.now()}`;

      // 楽観的に映画一覧キャッシュを更新
      updateMovieCacheFavorite(newItem.tmdb_movie_id, {
        id: optimisticId,
        rating: newItem.rating,
      });
      updateLookupCache((items) => [
        ...items.filter((item) => item.tmdb_movie_id !== newItem.tmdb_movie_id),
        {
          id: optimisticId,
          tmdb_movie_id: newItem.tmdb_movie_id,
          rating: newItem.rating,
        },
      ]);

      return { previousMoviesCache, previousLookup, optimisticId };
    },
    onSuccess: (response, _newItem, context) => {
      // 楽観的IDを実際のIDで上書き
      updateMovieCacheFavorite(response.data.tmdb_movie_id, {
        id: response.data.id,
        rating: response.data.rating,
      });
      updateLookupCache((items) =>
        items.map((item) =>
          item.id === context?.optimisticId
            ? {
                id: response.data.id,
                tmdb_movie_id: response.data.tmdb_movie_id,
                rating: response.data.rating,
              }
            : item,
        ),
      );
      toast({
        title: FAVORITES_SUCCESS_MESSAGES.ADDED,
        variant: 'success',
      });
    },
    onError: (error, _newItem, context) => {
      if (context?.previousMoviesCache) {
        for (const [key, data] of context.previousMoviesCache) {
          queryClient.setQueryData(key, data);
        }
      }
      restoreLookupCache(context?.previousLookup);
      toast({
        title: 'エラー',
        description: isConflictError(error)
          ? FAVORITES_ERROR_MESSAGES.ALREADY_EXISTS
          : FAVORITES_ERROR_MESSAGES.ADD_FAILED,
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
      await queryClient.cancelQueries({ queryKey: favoriteKeys.lookup() });

      const previousMoviesCache = queryClient.getQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all });
      const previousLookup = snapshotLookupCache();

      updateLookupCache((items) =>
        items.map((item) => (item.id === id ? { ...item, rating } : item)),
      );

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

      return { previousMoviesCache, previousLookup };
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
      restoreLookupCache(context?.previousLookup);
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
      await queryClient.cancelQueries({ queryKey: favoriteKeys.lookup() });

      const previousMoviesCache = queryClient.getQueriesData<{
        pages: GetMoviesResponse[];
        pageParams: number[];
      }>({ queryKey: movieKeys.all });
      const previousLookup = snapshotLookupCache();

      updateLookupCache((items) => items.filter((item) => item.id !== id));

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

      return { previousMoviesCache, previousLookup };
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
      restoreLookupCache(context?.previousLookup);
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
      addMutation.isPending,
      updateMutation.isPending,
      removeMutation.isPending,
    ],
  );
}
