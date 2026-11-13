/**
 * ウォッチリスト追加/削除トグル カスタムフック
 * 既存のウォッチリストキャッシュを参照 + mutation直接実行で、
 * 重複リクエストを防止する
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
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
  /**
   * 指定映画がトグル処理中かどうか（ボタンの無効化用）
   *
   * 「どれか1件でも処理中か」を返す `isToggling` も以前はあったが、
   * 同時に別の作品を操作すると**関係ない作品のボタンまで無効**になるため
   * 廃止した（#1055）。1件だけ扱う画面でもこちらを使う
   */
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
 * キャッシュと同じ寿命・同じ範囲で共有したいので QueryClient 単位で持つ。
 *
 * ⚠️ ログアウトで前の利用者の楽観状態が残らないのは、ログアウトが
 * `window.location` の完全遷移だから（src/lib/auth/logout.ts）。
 * クライアント遷移に変えるならここをクリアすること
 */
interface OptimisticStore {
  adds: Set<number>;
  removes: Set<number>;
  /**
   * 通信中の映画ID（#1055）
   *
   * **Set で持つ。** 以前は ref 1つにIDを1件だけ持っていたため、
   * 作品Aの通信中に作品Bを操作すると ref が上書きされ、**Aのボタンが
   * 通信中なのに有効へ戻って**いた。react-query の `isPending` も
   * mutation 単位なので、同時に2件飛ぶと片方しか表現できない。
   *
   * `adds` / `removes` と別に持つ理由は、意味が違うため。
   * あちらは「楽観的に反映済み」、こちらは「まだ通信が続いている」
   */
  toggling: Set<number>;
  listeners: Set<() => void>;
  /** 変化のたびに増える。useSyncExternalStore のスナップショットに使う */
  version: number;
}

/**
 * データが変わるキャッシュイベント。
 *
 * 観測者の増減（observerAdded 等）まで拾うと、画面を開くだけで
 * 全消費者が再描画される。
 *
 * ⚠️ `added` を入れてはいけない（#1061）。react-query は useInfiniteQuery の
 * observer を作る時点＝**レンダリング中**に queryCache.build() → add() →
 * notify({type:'added'}) を**同期で**発火する（notifyManager.batch は
 * コールバックを同期実行する）。拾うと「WatchlistPanel のレンダリング中に
 * MovieGrid の更新をスケジュールした」と React に報告され続ける。
 *
 * **`added` を外せば十分**な理由は、レンダリング中に飛ぶキャッシュイベントが
 * `added` だけだから。レンダリング中にキャッシュを変えるのは
 * `queryObserver` の build() だけで、`removed` は scheduleGc のタイマー経由、
 * `updated` は dispatch 経由でいずれもレンダリングの外。
 * ⚠️ レンダリング中に `setQueryData` を呼ぶコードを足すと `updated` が
 * レンダリング中に飛び、同じ警告が戻る。
 *
 * **取りこぼさない根拠は「このリポジトリでは `added` がデータを伴わない」こと。**
 * 生まれたてのクエリは data を持たないので、`added` 起因の再描画は常に直前と
 * 同じ値を計算していた。データは必ず `updated` で届く。
 *
 * 「`added` の直後に必ず `updated` が来る」とは書けない。`enabled: false` の
 * クエリ（useWatchlistCleanup の watchedYears / watched）は作られるだけで
 * fetch されず、`added` しか飛ばない。data を持たないので今は実害が無いだけ。
 *
 * ⚠️ したがって**この前提は無条件ではない**。queryCache.build() は第3引数で
 * state を渡せるため、データ入りの Query が `added` だけを伴って生まれる経路が
 * 存在する（query-core の hydration）。現状このリポジトリは HydrationBoundary /
 * dehydrate / prefetchQuery / initialData を使っていないので安全だが、
 * **SSR プリフェッチや initialData を導入する際はこの購読を見直すこと**。
 */
const CACHE_DATA_EVENTS = new Set(['removed', 'updated']);

/**
 * 削除 mutation の引数。
 *
 * API が要るのは `watchlistId` だけだが、**映画IDも一緒に運ぶ**（#1055）。
 * 後始末（`removes` / `toggling` から消す）は映画IDで引くのに、
 * 以前は onMutate の時点でキャッシュから逆引きしていた。
 * onMutate は `cancelQueries` の await をまたぐので、その間に対象が
 * キャッシュから消えると逆引きに失敗し、**後始末ごと飛ばされて**
 * ボタンがリロードまで無効のままになる。
 *
 * ref で持ってはいけない点は変わらない。別の作品を続けて操作すると
 * 上書きされ、違う作品の楽観状態を消し残す（#1054）
 */
interface RemoveVariables {
  watchlistId: string;
  tmdbMovieId: number;
}

const optimisticStores = new WeakMap<QueryClient, OptimisticStore>();

function getOptimisticStore(queryClient: QueryClient): OptimisticStore {
  const existing = optimisticStores.get(queryClient);

  if (existing) {
    return existing;
  }

  const created: OptimisticStore = {
    adds: new Set(),
    removes: new Set(),
    toggling: new Set(),
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
 * useWatchlist() を呼ばず、既存のウォッチリストキャッシュを直接参照することで
 * 重複リクエストを防止する。
 *
 * queryClient.getQueriesData() はリアクティブでないため、キャッシュと楽観状態の
 * 両方を useSyncExternalStore で購読する。楽観状態は QueryClient 単位で共有し、
 * 詳細モーダルでの操作がタイル側のインスタンスにも伝わるようにしている（#1009）。
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
          // 観測者の増減など、データが変わらないイベントで再描画しない
          if (!CACHE_DATA_EVENTS.has(event.type)) {
            return;
          }
          // ⚠️ 通知するだけでは再描画されない。useSyncExternalStore は
          // 通知のたびに getSnapshot() を読み直し、Object.is で同値なら
          // 打ち切る。スナップショット（version）を進めること
          store.version += 1;
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
      settledStore.toggling.delete(variables.tmdb_movie_id);
      notifyOptimisticChange(settledStore);
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ watchlistId }: RemoveVariables) =>
      removeWatchlist(watchlistId),
    onMutate: async ({ watchlistId }: RemoveVariables) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });

      const previousDataMap = optimisticRemoveFromAllCaches(
        queryClient,
        watchlistId,
      );
      return { previousDataMap };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDataMap) {
        rollbackCaches(queryClient, context.previousDataMap);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.REMOVE_FAILED,
        variant: 'error',
      });
    },
    onSettled: (_data, _error, variables: RemoveVariables) => {
      const settledStore = getOptimisticStore(queryClient);
      settledStore.removes.delete(variables.tmdbMovieId);
      settledStore.toggling.delete(variables.tmdbMovieId);
      notifyOptimisticChange(settledStore);
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  // mutation オブジェクトは毎描画で作り直されるが、mutate 自体は安定している
  const addMutate = addMutation.mutate;
  const removeMutate = removeMutation.mutate;

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
    // version は値としては使わないが、**参照を変えるために必須**。
    // 呼び出し側に useMemo(() => isInWatchlist(id), [isInWatchlist, id]) と
    // 書かれたものがあり（movieDetailContent.tsx）、外すと値が凍る。
    // ESLint は「不要」と言うが、消すと E2E 1本だけが落ちる壊れ方をする
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAuthenticated, store, queryClient, version],
  );

  /**
   * 参照が変わらない版の判定。
   *
   * `isInWatchlist` は version に依存して毎回作り直される（呼び出し側が
   * 参照の変化で再計算する契約のため）。それを toggleWatchlist が使うと
   * **こちらの参照も毎回変わり**、タイルへ関数として渡している
   * `React.memo` が全件で無効になる
   */
  const checkInWatchlist = useCallback(
    (tmdbMovieId: number) => {
      if (!isAuthenticated) return false;
      if (store.adds.has(tmdbMovieId)) return true;
      if (store.removes.has(tmdbMovieId)) return false;
      const items = getWatchlistItemsFromCache(queryClient);
      return items.some((item) => item.tmdb_movie_id === tmdbMovieId);
    },
    [isAuthenticated, store, queryClient],
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

      // 同じ作品の通信が続いている間は受け付けない。連打すると
      // 追加→追加 / 削除→削除 の重複リクエストが飛ぶ（#1055）
      if (store.toggling.has(movie.id)) {
        return;
      }

      // GA4 への送信は操作時点で行う（mutation の成否は待たない）。
      // 楽観的なトーストと同じ位置に揃えるため。通信失敗分も計上される。
      //
      // ⚠️ 以前は「完了時に解決すると、どの作品の完了かを別途持つ必要が出る」と
      // 書いていたが、**その理由はもう成立しない**。両 mutation が variables に
      // 映画IDを載せたので、onSettled だけで作品が分かる（#1055）。
      // 位置を変えない理由はトーストと揃えること1点
      if (checkInWatchlist(movie.id)) {
        const watchlistId = getWatchlistId(movie.id);
        if (watchlistId) {
          // 楽観状態を更新（即座にUIへ反映。他のインスタンスにも伝わる）
          // 通信を出す分だけ印を付ける。冒頭で付けると、watchlistId が
          // 取れず**何も起きなかった**ときに消す相手がおらず、
          // そのボタンがリロードまで無効のままになる
          store.toggling.add(movie.id);
          store.removes.add(movie.id);
          store.adds.delete(movie.id);
          notifyOptimisticChange(store);
          removeMutate({ watchlistId, tmdbMovieId: movie.id });
          sendEvent(ANALYTICS_EVENTS.WATCHLIST_REMOVE, { movie_id: movie.id });
          toast({
            title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
            variant: 'success',
          });
        }
      } else {
        // 楽観状態を更新（即座にUIへ反映。他のインスタンスにも伝わる）
        store.toggling.add(movie.id);
        store.adds.add(movie.id);
        store.removes.delete(movie.id);
        notifyOptimisticChange(store);
        addMutate({
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
      checkInWatchlist,
      getWatchlistId,
      addMutate,
      removeMutate,
      toast,
      store,
    ],
  );

  const isMovieToggling = useCallback(
    (tmdbMovieId: number) => store.toggling.has(tmdbMovieId),
    // version は値としては使わないが、**参照を変えるために必須**
    // （isInWatchlist と同じ理由）。外すと通信中の表示が凍る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );

  return useMemo(
    () => ({
      isInWatchlist,
      toggleWatchlist,
      isMovieToggling,
    }),
    [isInWatchlist, toggleWatchlist, isMovieToggling],
  );
}
