/**
 * レコメンド手動更新カスタムフック
 * 更新APIの呼び出し・残り回数管理・UI状態を提供
 */

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  refreshRecommendations,
  getRefreshCount,
} from '@/lib/api/recommendations/recommendations';
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

  const { data: countData, isLoading: isCountLoading } = useQuery({
    queryKey: recommendationKeys.refreshCount,
    queryFn: getRefreshCount,
    staleTime: 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: refreshRecommendations,
    onSuccess: (data) => {
      queryClient.setQueryData(recommendationKeys.refreshCount, {
        usedCount: RECOMMENDATION_REFRESH.MAX_COUNT - data.remainingCount,
        maxCount: RECOMMENDATION_REFRESH.MAX_COUNT,
        remainingCount: data.remainingCount,
      });
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
  });

  const refresh = useCallback(() => {
    mutation.mutate();
  }, [mutation]);

  const usedCount = countData?.usedCount ?? 0;
  const maxCount = countData?.maxCount ?? RECOMMENDATION_REFRESH.MAX_COUNT;
  const remainingCount = countData?.remainingCount ?? RECOMMENDATION_REFRESH.MAX_COUNT;
  const isLimitReached = remainingCount <= 0;

  return useMemo(
    () => ({
      refresh,
      isRefreshing: mutation.isPending,
      remainingCount,
      maxCount,
      usedCount,
      isLimitReached,
      isCountLoading,
    }),
    [
      refresh,
      mutation.isPending,
      remainingCount,
      maxCount,
      usedCount,
      isLimitReached,
      isCountLoading,
    ],
  );
}
