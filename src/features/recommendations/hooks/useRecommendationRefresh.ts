/**
 * レコメンド手動更新カスタムフック
 * 更新APIの呼び出し・残り回数管理・UI状態を提供
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  refreshRecommendations,
  getRefreshCount,
} from '@/lib/api/recommendations/recommendations';
import { useRecommendationRefreshStore } from '@/features/recommendations/store/recommendationRefreshStore';
import { useToast } from '@/hooks/useToast';
import {
  RECOMMENDATION_REFRESH,
  RECOMMENDATION_REFRESH_MESSAGES,
  recommendationKeys,
} from '@/constants';
import type { Recommendation } from '@/schema/recommendations';

/**
 * useRecommendationRefreshフックの返り値
 */
export interface UseRecommendationRefreshReturn {
  /** 更新を実行する */
  refresh: () => void;
  /** 更新処理中かどうか */
  isRefreshing: boolean;
  /** クールダウン中かどうか（更新完了直後の連打防止） */
  isCoolingDown: boolean;
  /** 更新を実行できない状態かどうか（処理中・クールダウン中・上限到達） */
  isRefreshDisabled: boolean;
  /** 残り回数 */
  remainingCount: number;
  /** 月あたり上限 */
  maxCount: number;
  /** 使用済み回数 */
  usedCount: number;
  /** 上限到達済みかどうか */
  isLimitReached: boolean;
  /** 残り回数読み込み中かどうか */
  isCountLoading: boolean;
}

/**
 * レコメンド手動更新フック
 */
export function useRecommendationRefresh(
  onSuccess?: (recommendations: Recommendation[]) => void,
): UseRecommendationRefreshReturn {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 画面遷移でアンマウントしても進行状態が消えないようグローバルストアで保持する
  const isRefreshing = useRecommendationRefreshStore(
    (state) => state.isRefreshing,
  );
  const startRefresh = useRecommendationRefreshStore(
    (state) => state.startRefresh,
  );
  const endRefresh = useRecommendationRefreshStore((state) => state.endRefresh);

  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // アンマウント時にタイマーを破棄する
  useEffect(
    () => () => {
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
      }
    },
    [],
  );

  const { data: countData, isLoading: isCountLoading } = useQuery({
    queryKey: recommendationKeys.refreshCount,
    queryFn: getRefreshCount,
    staleTime: 60 * 1000,
  });

  const mutation = useMutation({
    // 進行状態の記録・解除は mutationFn 内で行う。
    // onMutate / onSettled はコンポーネントがアンマウントすると呼ばれないため、
    // 画面遷移後に isRefreshing が立ちっぱなしになる。
    mutationFn: async () => {
      startRefresh();
      try {
        return await refreshRecommendations();
      } finally {
        endRefresh();
        // アンマウント後も残回数を確実に同期させる（onSuccessは呼ばれないため）
        queryClient.invalidateQueries({
          queryKey: recommendationKeys.refreshCount,
        });
      }
    },
    onSuccess: (data) => {
      toast({
        title: RECOMMENDATION_REFRESH_MESSAGES.SUCCESS,
        variant: 'success',
      });
      onSuccess?.(data.recommendations);
    },
    onError: () => {
      toast({
        title: RECOMMENDATION_REFRESH_MESSAGES.GENERATION_FAILED,
        variant: 'error',
      });
    },
    // 成功・失敗どちらでもクールダウンに入る（失敗時の再試行連打も抑止）
    onSettled: () => {
      setIsCoolingDown(true);
      cooldownTimerRef.current = setTimeout(() => {
        setIsCoolingDown(false);
        cooldownTimerRef.current = null;
      }, RECOMMENDATION_REFRESH.CLIENT_COOLDOWN_MS);
    },
  });

  const usedCount = countData?.usedCount ?? 0;
  const maxCount = countData?.maxCount ?? RECOMMENDATION_REFRESH.MAX_COUNT;
  const remainingCount =
    countData?.remainingCount ?? RECOMMENDATION_REFRESH.MAX_COUNT;
  const isLimitReached = remainingCount <= 0;
  const isRefreshDisabled = isRefreshing || isCoolingDown || isLimitReached;

  const refresh = useCallback(() => {
    // ボタンのdisabledだけに頼らず、フック側でも多重実行を止める
    if (isRefreshDisabled) return;
    mutation.mutate();
  }, [mutation, isRefreshDisabled]);

  return useMemo(
    () => ({
      refresh,
      isRefreshing,
      isCoolingDown,
      isRefreshDisabled,
      remainingCount,
      maxCount,
      usedCount,
      isLimitReached,
      isCountLoading,
    }),
    [
      refresh,
      isRefreshing,
      isCoolingDown,
      isRefreshDisabled,
      remainingCount,
      maxCount,
      usedCount,
      isLimitReached,
      isCountLoading,
    ],
  );
}
