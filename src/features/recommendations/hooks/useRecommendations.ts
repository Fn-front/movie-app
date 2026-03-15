/**
 * useRecommendationsフック
 * レコメンド一覧をTanStack Queryで取得・キャッシュ
 */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getRecommendationsApi } from '@/lib/api/recommendations/recommendations';
import { recommendationKeys, RECOMMENDATIONS_STALE_TIME } from '@/constants';
import type { Recommendation } from '@/schema/recommendations';

/**
 * useRecommendationsフックの返り値
 */
export interface UseRecommendationsReturn {
  /** レコメンド一覧 */
  recommendations: Recommendation[];
  /** 生成日時（未生成の場合null） */
  generatedAt: string | null;
  /** お気に入りが1件以上あるか */
  hasFavorites: boolean;
  /** ローディング中 */
  isLoading: boolean;
  /** エラー状態 */
  isError: boolean;
}

/**
 * レコメンド一覧取得フック
 */
export function useRecommendations(): UseRecommendationsReturn {
  const recommendationsQuery = useQuery({
    queryKey: recommendationKeys.all,
    queryFn: () => getRecommendationsApi(),
    staleTime: RECOMMENDATIONS_STALE_TIME,
    gcTime: RECOMMENDATIONS_STALE_TIME,
  });

  const recommendations = useMemo(
    () => recommendationsQuery.data?.data.recommendations ?? [],
    [recommendationsQuery.data],
  );

  const generatedAt = useMemo(
    () => recommendationsQuery.data?.data.generated_at ?? null,
    [recommendationsQuery.data],
  );

  const hasFavorites = useMemo(
    () => recommendationsQuery.data?.data.has_favorites ?? false,
    [recommendationsQuery.data],
  );

  return useMemo(
    () => ({
      recommendations,
      generatedAt,
      hasFavorites,
      isLoading: recommendationsQuery.isLoading,
      isError: recommendationsQuery.isError,
    }),
    [
      recommendations,
      generatedAt,
      hasFavorites,
      recommendationsQuery.isLoading,
      recommendationsQuery.isError,
    ],
  );
}
