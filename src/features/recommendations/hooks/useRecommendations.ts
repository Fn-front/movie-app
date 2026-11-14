/**
 * レコメンド一覧取得フック
 *
 * ホーム（`/`）を静的プリレンダに保つため、サーバー取得から移した（#1115）。
 * セクションと詳細モーダルが**同じ queryKey** を読むことで、
 * モーダルのアクセシブル名に出す作品名を共有する。
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { recommendationKeys } from '@/constants';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { getRecommendations } from '@/lib/api/recommendations/recommendations';
// ⚠️ 型だけを取る。`recommendationData.ts` はサーバー側のDBアクセスを持つので、
// 値を import するとクライアントのモジュールグラフに引き込むことになる
import type { RecommendationData } from '@/lib/api/recommendations/recommendationData';
import type { Recommendation } from '@/schema/recommendations';

/** キャッシュが空のときの土台（差し替え時に他のフィールドを消さないため） */
const EMPTY_DATA: RecommendationData = {
  recommendations: [],
  generatedAt: null,
  hasFavorites: false,
};

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
  /**
   * 取得に失敗したかどうか
   *
   * ⚠️ **これを無視すると、取得失敗が「お気に入り0件」と区別できない。**
   * 失敗時は `hasFavorites` が false に落ちるため、お気に入りを登録済みの
   * 利用者にまで登録促進の文言が出る（#1115 でクライアント取得へ移して
   * 増えた失敗経路）
   */
  isError: boolean;
  /** 取得したレコメンドでキャッシュを差し替える（手動更新用） */
  setRecommendations: (next: Recommendation[]) => void;
}

/**
 * レコメンド一覧を取得する
 */
export function useRecommendations(): UseRecommendationsReturn {
  const { isAuthenticated, isResolving } = useAuthStatus();
  const queryClient = useQueryClient();

  const {
    data,
    isPending: isQueryPending,
    isError,
  } = useQuery({
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
          ...(prev ?? EMPTY_DATA),
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
      isPending: isResolving || (isAuthenticated && isQueryPending),
      isError: isAuthenticated && isError,
      setRecommendations,
    }),
    [
      data,
      isAuthenticated,
      isResolving,
      isQueryPending,
      isError,
      setRecommendations,
    ],
  );
}
