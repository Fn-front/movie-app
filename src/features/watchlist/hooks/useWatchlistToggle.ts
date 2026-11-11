/**
 * ウォッチリスト追加/削除トグル カスタムフック
 * 既存のウォッチリストキャッシュを参照 + mutation直接実行で、
 * 重複リクエストを防止する
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import {
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
} from '@/constants/watchlist';
import { ANALYTICS_EVENTS, watchlistKeys } from '@/constants';
import { addWatchlist, removeWatchlist } from '@/lib/api/watchlist/watchlist';
import { sendEvent } from '@/utils/analytics';
import { useLoginPromptStore } from '@/lib/store/useLoginPromptStore';
import type {
  WatchlistItem,
  GetWatchlistResponse,
} from '@/lib/api/watchlist/watchlist';
import type { WatchlistAddFormData } from '@/schema/watchlist';
import { useToastDispatch } from '@/hooks/useToast';

/**
 * トグル対象の映画データ（最小限のフィールド）
 */
interface WatchlistToggleMovie {
  /** TMDb映画ID */
  id: number;
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string | null;
}

/**
 * useWatchlistToggleフックの返り値
 */
export interface UseWatchlistToggleReturn {
  /** 指定映画がウォッチリストに含まれているか */
  isInWatchlist: (tmdbMovieId: number) => boolean;
  /** ウォッチリスト追加/削除をトグル */
  toggleWatchlist: (movie: WatchlistToggleMovie) => void;
  /** 追加/削除処理中 */
  isToggling: boolean;
  /** 指定映画がトグル処理中かどうか（per-movie無効化用） */
  isMovieToggling: (tmdbMovieId: number) => boolean;
}

/** InfiniteQueryのデータ型 */
type WatchlistInfiniteData = {
  pages: GetWatchlistResponse[];
  pageParams: (string | undefined)[];
};

/**
 * 既存のウォッチリストキャッシュから全アイテムを取得する
 * watchlistKeys.all をプレフィックスとして、どのsortオプションのキャッシュからも読み取る
 */
function getWatchlistItemsFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
): WatchlistItem[] {
  const queries = queryClient.getQueriesData<WatchlistInfiniteData>({
    queryKey: watchlistKeys.all,
  });

  const items: WatchlistItem[] = [];
  for (const [, data] of queries) {
    if (data?.pages) {
      for (const page of data.pages) {
        items.push(...page.data.watchlist);
      }
    }
  }
  return items;
}

/**
 * 全ウォッチリストキャッシュに楽観的にアイテムを追加する
 */
function optimisticAddToAllCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  item: WatchlistItem,
): Map<readonly unknown[], WatchlistInfiniteData | undefined> {
  const previousDataMap = new Map<
    readonly unknown[],
    WatchlistInfiniteData | undefined
  >();

  const queries = queryClient.getQueriesData<WatchlistInfiniteData>({
    queryKey: watchlistKeys.all,
  });

  for (const [key, data] of queries) {
    previousDataMap.set(key, data);
    if (data?.pages && data.pages.length > 0) {
      queryClient.setQueryData<WatchlistInfiniteData>(key, {
        ...data,
        pages: data.pages.map((page, i) =>
          i === 0
            ? {
                ...page,
                data: {
                  ...page.data,
                  watchlist: [item, ...page.data.watchlist],
                },
              }
            : page,
        ),
      });
    }
  }

  return previousDataMap;
}

/**
 * 全ウォッチリストキャッシュから楽観的にアイテムを削除する
 */
function optimisticRemoveFromAllCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): Map<readonly unknown[], WatchlistInfiniteData | undefined> {
  const previousDataMap = new Map<
    readonly unknown[],
    WatchlistInfiniteData | undefined
  >();

  const queries = queryClient.getQueriesData<WatchlistInfiniteData>({
    queryKey: watchlistKeys.all,
  });

  for (const [key, data] of queries) {
    previousDataMap.set(key, data);
    if (data?.pages) {
      queryClient.setQueryData<WatchlistInfiniteData>(key, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: {
            ...page.data,
            watchlist: page.data.watchlist.filter((item) => item.id !== id),
          },
        })),
      });
    }
  }

  return previousDataMap;
}

/**
 * 楽観的なトグル状態と、その購読者。
 *
 * `useState` でフックのインスタンスごとに持つと、詳細モーダルで操作しても
 * タイル側のインスタンスは再レンダリングされない。以前は「トーストが出る →
 * useToast() の toasts 購読で全消費者が再レンダリング」という**偶然の依存**で
 * 同期していた（#1009）。
 *
 * キャッシュと同じ寿命・同じ範囲で共有したいので QueryClient 単位で持つ
 */
interface OptimisticStore {
  adds: Set<number>;
  removes: Set<number>;
  listeners: Set<() => void>;
  /** 変化のたびに増える。useSyncExternalStore のスナップショットに使う */
  version: number;
}

const optimisticStores = new WeakMap<object, OptimisticStore>();

function getOptimisticStore(queryClient: object): OptimisticStore {
  const existing = optimisticStores.get(queryClient);

  if (existing) {
    return existing;
  }

  const created: OptimisticStore = {
    adds: new Set(),
    removes: new Set(),
    listeners: new Set(),
    version: 0,
  };
  optimisticStores.set(queryClient, created);
  return created;
}

/** 購読者へ変更を伝える */
function notifyOptimisticChange(store: OptimisticStore): void {
  store.version += 1;
  for (const listener of store.listeners) {
    listener();
  }
}

/**
 * キャッシュをロールバックする
 */
function rollbackCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  previousDataMap: Map<readonly unknown[], WatchlistInfiniteData | undefined>,
): void {
  for (const [key, data] of previousDataMap) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * ウォッチリスト追加/削除トグル カスタムフック
 *
 * useWatchlist()を呼ばず、既存のウォッチリストキャッシュを直接参照することで
 * 重複リクエストを防止する。楽観的UI更新は全キャッシュ + ローカルstateで管理。
 *
 * queryClient.getQueriesData()はリアクティブではないため、
 * ローカルstateで楽観的なトグル状態を追跡し、即座にUIへ反映する。
 */
export function useWatchlistToggle(): UseWatchlistToggleReturn {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  // 無効化済みセッション（パスワード変更・絶対期限切れ）は user が
  // 空文字で埋められたオブジェクトとして返るため、存在確認では判定できない。
  // id の有無で見る（getAuthSession と同じ基準）
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;
  // トーストは送出するだけ。一覧は購読しない（#939 / #1009）
  const { toast } = useToastDispatch();
  const openLoginPrompt = useLoginPromptStore((s) => s.open);

  const togglingIdRef = useRef<number | null>(null);

  const store = getOptimisticStore(queryClient);

  /**
   * 楽観状態とキャッシュの変化を購読する。
   *
   * queryClient.getQueriesData() はリアクティブではないので、これが無いと
   * 「キャッシュが変わってもタイルを再レンダリングさせるものが無い」状態に
   * なる。以前はトーストの再レンダリングに相乗りしていた（#1009）
   */
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      store.listeners.add(onStoreChange);

      const unsubscribeCache = queryClient
        .getQueryCache()
        .subscribe((event) => {
          if (event.query.queryKey[0] !== watchlistKeys.all[0]) {
            return;
          }
          onStoreChange();
        });

      return () => {
        store.listeners.delete(onStoreChange);
        unsubscribeCache();
      };
    },
    [queryClient, store],
  );

  /**
   * 変化を表す値。
   *
   * キャッシュの中身を返すと毎回新しい参照になり、useSyncExternalStore の
   * Object.is 比較で無限ループになる。「何か変わった」ことだけを数値で伝え、
   * 実際の値は読む時点で取りに行く
   */
  const getSnapshot = useCallback(() => store.version, [store]);
  const getServerSnapshot = useCallback(() => 0, []);

  /**
   * 変化のたびに増える値。
   *
   * isInWatchlist の依存に入れて**参照を変える**ために要る。呼び出し側には
   * `useMemo(() => isInWatchlist(id), [isInWatchlist, id])` のように
   * 「答えが変わるときは参照も変わる」前提で書かれたものがある
   * （movieDetailContent.tsx）。安定させると値が凍る
   */
  const version = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const addMutation = useMutation({
    mutationFn: addWatchlist,
    onMutate: async (newItem: WatchlistAddFormData) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });

      const optimisticItem: WatchlistItem = {
        id: `optimistic-${Date.now()}`,
        tmdb_movie_id: newItem.tmdb_movie_id,
        title: newItem.title,
        poster_path: newItem.poster_path ?? null,
        release_date: newItem.release_date ?? null,
        added_at: new Date().toISOString(),
        watched_at: null,
        // サーバーが追加時に配信状況を埋める（initMovieStreamingStatus）。
        // 楽観アイテムの時点では結果が分からないので null で置き、
        // onSettled の再取得でバッジの有無が確定する
        streaming: null,
      };

      const previousDataMap = optimisticAddToAllCaches(
        queryClient,
        optimisticItem,
      );
      return { previousDataMap };
    },
    onError: (_error, _newItem, context) => {
      if (context?.previousDataMap) {
        rollbackCaches(queryClient, context.previousDataMap);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.ADD_FAILED,
        variant: 'error',
      });
    },
    onSettled: (_data, _error, variables) => {
      const settledStore = getOptimisticStore(queryClient);
      settledStore.adds.delete(variables.tmdb_movie_id);
      notifyOptimisticChange(settledStore);
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeWatchlist,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });

      const previousDataMap = optimisticRemoveFromAllCaches(queryClient, id);
      return { previousDataMap };
    },
    onError: (_error, _id, context) => {
      if (context?.previousDataMap) {
        rollbackCaches(queryClient, context.previousDataMap);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.REMOVE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      // 対象の映画IDは ref から取る
      if (togglingIdRef.current !== null) {
        const settledStore = getOptimisticStore(queryClient);
        settledStore.removes.delete(togglingIdRef.current);
        notifyOptimisticChange(settledStore);
      }
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  const isInWatchlist = useCallback(
    (tmdbMovieId: number) => {
      if (!isAuthenticated) return false;
      // ローカル楽観状態を優先チェック
      if (store.adds.has(tmdbMovieId)) return true;
      if (store.removes.has(tmdbMovieId)) return false;
      // キャッシュから確認
      const items = getWatchlistItemsFromCache(queryClient);
      return items.some((item) => item.tmdb_movie_id === tmdbMovieId);
    },
    [isAuthenticated, store, queryClient, version],
  );

  const getWatchlistId = useCallback(
    (tmdbMovieId: number): string | undefined => {
      const items = getWatchlistItemsFromCache(queryClient);
      return items.find((item) => item.tmdb_movie_id === tmdbMovieId)?.id;
    },
    [queryClient],
  );

  const toggleWatchlist = useCallback(
    (movie: WatchlistToggleMovie) => {
      if (!isAuthenticated) {
        openLoginPrompt('ウォッチリストに追加するにはログインが必要です。');
        return;
      }

      togglingIdRef.current = movie.id;

      // GA4 への送信は操作時点で行う（mutation の成否は待たない）。楽観的な
      // トーストと同じ位置に揃えるため。通信失敗分も計上される代わりに、
      // 成功時送信で必要になる togglingIdRef 経由のID解決を避けられる
      // （連続操作で ref が上書きされ、別作品のIDで送る事故が起きうる）
      if (isInWatchlist(movie.id)) {
        const watchlistId = getWatchlistId(movie.id);
        if (watchlistId) {
          // 楽観状態を更新（即座にUIへ反映。他のインスタンスにも伝わる）
          store.removes.add(movie.id);
          store.adds.delete(movie.id);
          notifyOptimisticChange(store);
          removeMutation.mutate(watchlistId);
          sendEvent(ANALYTICS_EVENTS.WATCHLIST_REMOVE, { movie_id: movie.id });
          toast({
            title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
            variant: 'success',
          });
        }
      } else {
        // 楽観状態を更新（即座にUIへ反映。他のインスタンスにも伝わる）
        store.adds.add(movie.id);
        store.removes.delete(movie.id);
        notifyOptimisticChange(store);
        addMutation.mutate({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date,
        });
        sendEvent(ANALYTICS_EVENTS.WATCHLIST_ADD, { movie_id: movie.id });
        toast({
          title: WATCHLIST_SUCCESS_MESSAGES.ADDED,
          variant: 'success',
        });
      }
    },
    [
      isAuthenticated,
      openLoginPrompt,
      isInWatchlist,
      getWatchlistId,
      addMutation,
      removeMutation,
      toast,
      store,
    ],
  );

  const isAdding = addMutation.isPending;
  const isRemoving = removeMutation.isPending;

  const isMovieToggling = useCallback(
    (tmdbMovieId: number) =>
      (isAdding || isRemoving) && togglingIdRef.current === tmdbMovieId,
    [isAdding, isRemoving],
  );

  return useMemo(
    () => ({
      isInWatchlist,
      toggleWatchlist,
      isToggling: isAdding || isRemoving,
      isMovieToggling,
    }),
    [isInWatchlist, toggleWatchlist, isAdding, isRemoving, isMovieToggling],
  );
}
