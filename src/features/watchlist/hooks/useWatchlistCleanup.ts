/**
 * 視聴済み一括削除 カスタムフック
 *
 * 年セレクトの選択肢・対象一覧（無限スクロール）・除外選択・削除をまとめる。
 *
 * 「すべて選択」は画面に出ている分ではなく、その年の視聴済み全件を意味する。
 * そのため選択件数は読み込み済み件数ではなく、サーバーが返す総件数から
 * 除外数を引いて求める。未スクロール分も削除対象に含まれることと一致させるため。
 */

import { useCallback, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  ANALYTICS_EVENTS,
  watchlistKeys,
  WATCHLIST_DEFAULT_LIMIT,
  WATCHLIST_ERROR_MESSAGES,
} from '@/constants';
import { sendEvent } from '@/utils/analytics';
import { useToast } from '@/hooks/useToast';
import {
  bulkDeleteWatchlist,
  getWatchlistWatched,
  getWatchlistWatchedYears,
} from '@/lib/api/watchlist/watchlist';
import type {
  WatchlistWatchedItem,
  WatchlistWatchedYear,
} from '@/lib/api/watchlist/watchlist';

/**
 * useWatchlistCleanupフックのオプション
 */
export interface UseWatchlistCleanupOptions {
  /** モーダルが開いているか。閉じている間はクエリを発行しない */
  enabled: boolean;
  /** 削除が成功したときに呼ばれる */
  onDeleted: () => void;
}

/**
 * useWatchlistCleanupフックの返り値
 */
export interface UseWatchlistCleanupReturn {
  /** 視聴済みがある追加年の一覧 */
  years: WatchlistWatchedYear[];
  /** 年一覧の読み込み中 */
  isYearsLoading: boolean;
  /** 選択中の年 */
  selectedYear: number | null;
  /** 年の変更ハンドラー */
  handleYearChange: (value: string) => void;
  /** 読み込み済みの対象アイテム */
  items: WatchlistWatchedItem[];
  /** 対象一覧の初回読み込み中 */
  isItemsLoading: boolean;
  /** 次ページ読み込み中 */
  isFetchingNextPage: boolean;
  /** 次ページがあるか */
  hasNextPage: boolean;
  /** 次ページを読み込む */
  fetchNextPage: () => void;
  /** 削除対象の件数（その年の総件数 - 除外数） */
  selectedCount: number;
  /** その年の視聴済み総件数 */
  totalCount: number;
  /**
   * その年のうち、お気に入り未登録の件数
   *
   * 削除すると観たという記録が残らない作品の数。注意書きの表示に使う。
   */
  unratedCount: number;
  /** 指定IDが削除対象か */
  isSelected: (id: string) => boolean;
  /** 指定IDの選択を切り替える */
  toggleItem: (id: string) => void;
  /** 全件が選択されているか */
  isAllSelected: boolean;
  /** 全選択に戻す */
  toggleAll: () => void;
  /** 削除を実行する */
  handleDelete: () => void;
  /** 削除中 */
  isDeleting: boolean;
}

/**
 * 視聴済み一括削除 カスタムフック
 */
export function useWatchlistCleanup({
  enabled,
  onDeleted,
}: UseWatchlistCleanupOptions): UseWatchlistCleanupReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ユーザーがセレクトで明示的に選んだ年。未操作なら null
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());

  // 年セレクトの選択肢
  const yearsQuery = useQuery({
    queryKey: watchlistKeys.watchedYears(),
    queryFn: getWatchlistWatchedYears,
    enabled,
  });

  const years = useMemo(
    () => yearsQuery.data?.data.years ?? [],
    [yearsQuery.data],
  );

  // 実効的な選択年を派生で求める。
  //
  // 「年一覧が届いたら最新年を入れる」を useEffect + setState で書くと、
  // 描画後にもう一度レンダーが走るうえ react-hooks/set-state-in-effect に触れる。
  // 選んだ年が一覧から消えたとき（その年を消し切った直後など）に最新年へ
  // 戻す挙動も、ここで一緒に表現できる。
  const selectedYear = useMemo(() => {
    if (years.length === 0) return null;

    const isPickedAvailable =
      pickedYear !== null && years.some((entry) => entry.year === pickedYear);

    return isPickedAvailable ? pickedYear : years[0].year;
  }, [years, pickedYear]);

  // 対象一覧（無限スクロール）
  const itemsQuery = useInfiniteQuery({
    queryKey: watchlistKeys.watched(selectedYear),
    queryFn: ({ pageParam }) =>
      getWatchlistWatched({
        year: selectedYear as number,
        cursor: pageParam,
        limit: WATCHLIST_DEFAULT_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.data.has_more
        ? (lastPage.data.next_cursor ?? undefined)
        : undefined,
    enabled: enabled && selectedYear !== null,
  });

  const items = useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.data.watchlist) ?? [],
    [itemsQuery.data],
  );

  // 総件数と未登録件数は年一覧の集計を使う。
  // 対象一覧のページングとは独立して、年全体の正しい値が得られる
  const selectedYearEntry = useMemo(
    () => years.find((entry) => entry.year === selectedYear),
    [years, selectedYear],
  );

  const totalCount = selectedYearEntry?.count ?? 0;
  const unratedCount = selectedYearEntry?.unrated_count ?? 0;

  const selectedCount = Math.max(0, totalCount - excludeIds.size);
  const isAllSelected = totalCount > 0 && excludeIds.size === 0;

  const deleteMutation = useMutation({
    mutationFn: bulkDeleteWatchlist,
    onSuccess: (response) => {
      toast({
        title: '削除しました',
        description: response.message,
        variant: 'success',
      });
      // 一覧・サイドバー・年一覧すべてに効かせる
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
      setExcludeIds(new Set());
      onDeleted();
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.BULK_DELETE_FAILED,
        variant: 'error',
      });
    },
  });

  const handleYearChange = useCallback((value: string) => {
    setPickedYear(Number(value));
    // 別の年は別の対象なので、除外選択を持ち越さない
    setExcludeIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => !excludeIds.has(id),
    [excludeIds],
  );

  const toggleItem = useCallback((id: string) => {
    setExcludeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 「すべて選択」は全選択に戻す操作だけを持つ。
  //
  // 全解除を用意しない理由: 未読み込みの行を除外IDに積めないため、
  // 「その年の全件を除外した状態」をこの実装では正しく表せない。
  // 全部残したいユーザーはモーダルを閉じればよく、削除ボタンは要らない。
  // そのためチェックボックスは全選択時のみ無効（押せない）にする。
  const toggleAll = useCallback(() => {
    setExcludeIds(new Set());
  }, []);

  const handleDelete = useCallback(() => {
    if (selectedYear === null) return;

    deleteMutation.mutate({
      year: selectedYear,
      exclude_ids: Array.from(excludeIds),
    });

    // 1件ずつの削除とはイベント名を分ける。同じ watchlist_remove にすると
    // 一括削除1回が数十件として計上され、削除の傾向を読み違える。
    // 対象の年は送らない（利用者のウォッチリストの中身が分かるため）
    sendEvent(ANALYTICS_EVENTS.WATCHLIST_BULK_REMOVE, {
      item_count: selectedCount,
    });
  }, [deleteMutation, selectedYear, excludeIds, selectedCount]);

  // itemsQuery 全体を依存に入れると毎レンダー参照が変わり useCallback が効かない。
  // react-query の fetchNextPage は参照が安定しているので、それだけを取り出す
  const { fetchNextPage: fetchNextPageRaw } = itemsQuery;

  const fetchNextPage = useCallback(() => {
    fetchNextPageRaw();
  }, [fetchNextPageRaw]);

  return useMemo(
    () => ({
      years,
      isYearsLoading: yearsQuery.isLoading,
      selectedYear,
      handleYearChange,
      items,
      isItemsLoading: itemsQuery.isLoading,
      isFetchingNextPage: itemsQuery.isFetchingNextPage,
      hasNextPage: itemsQuery.hasNextPage,
      fetchNextPage,
      selectedCount,
      totalCount,
      unratedCount,
      isSelected,
      toggleItem,
      isAllSelected,
      toggleAll,
      handleDelete,
      isDeleting: deleteMutation.isPending,
    }),
    [
      years,
      yearsQuery.isLoading,
      selectedYear,
      handleYearChange,
      items,
      itemsQuery.isLoading,
      itemsQuery.isFetchingNextPage,
      itemsQuery.hasNextPage,
      fetchNextPage,
      selectedCount,
      totalCount,
      unratedCount,
      isSelected,
      toggleItem,
      isAllSelected,
      toggleAll,
      handleDelete,
      deleteMutation.isPending,
    ],
  );
}
