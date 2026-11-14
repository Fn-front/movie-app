/**
 * レコメンド一覧取得フック
 *
 * ホーム（`/`）を静的プリレンダに保つため、サーバー取得から移した（#1115）。
 * セクションと詳細モーダルが**同じ queryKey** を読むことで、
 * モーダルのアクセシブル名に出す作品名を共有する。
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useCallback, useMemo } from 'react';

import { recommendationKeys } from '@/constants';
import { getRecommendations } from '@/lib/api/recommendations/recommendations';
import {
  EMPTY_RECOMMENDATION_DATA,
  type RecommendationData,
} from '@/lib/api/recommendations/recommendationData';
import type { Recommendation } from '@/schema/recommendations';

/** useRecommendations の返り値 */
export interface UseRecommendationsReturn {
  /** レコメンド一覧（未認証・未取得なら空） */
  recommendations: Recommendation[];
  /** お気に入りが1件以上あるか */
  hasFavorites: boolean;
  /** 認証済みかどうか（セッション解決前は false） */
  isAuthenticated: boolean;
  /**
   * セクションを描いてよいかが未確定かどうか
   *
   * セッションの解決前に「未認証」と決めつけると、ログイン中の利用者には
   * 一瞬セクションが消えて見える。描画の判断はこれが false になってから行う
   */
  isPending: boolean;
  /** 取得したレコメンドでキャッシュを差し替える（手動更新用） */
  setRecommendations: (next: Recommendation[]) => void;
}

/**
 * レコメンド一覧を取得する
 */
export function useRecommendations(): UseRecommendationsReturn {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const queryClient = useQueryClient();

  const { data, isPending: isQueryPending } = useQuery({
    queryKey: recommendationKeys.list,
    queryFn: getRecommendations,
    enabled: isAuthenticated,
    // ホームへ戻るたびに取り直さない。更新はボタン（手動更新）が担う
    staleTime: 5 * 60 * 1000,
  });

  const setRecommendations = useCallback(
    (next: Recommendation[]) => {
      queryClient.setQueryData<RecommendationData>(
        recommendationKeys.list,
        (prev) => ({
          ...(prev ?? EMPTY_RECOMMENDATION_DATA),
          recommendations: next,
        }),
      );
    },
    [queryClient],
  );

  return useMemo(
    () => ({
      recommendations: data?.recommendations ?? [],
      hasFavorites: data?.hasFavorites ?? false,
      isAuthenticated,
      // 未認証と確定するまでは「未確定」。認証済みなら取得完了までが未確定
      isPending: status === 'loading' || (isAuthenticated && isQueryPending),
      setRecommendations,
    }),
    [data, isAuthenticated, status, isQueryPending, setRecommendations],
  );
}
