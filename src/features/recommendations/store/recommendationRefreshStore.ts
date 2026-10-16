/**
 * レコメンド手動更新の進行状態ストア
 *
 * React Query の mutation 状態はコンポーネントローカルのため、別ページへ遷移して
 * アンマウントすると「生成中」インジケータが消えて状態が分からなくなる。
 * グローバルストアに昇格させ、画面を離れて戻ってきても進行状態が見えるようにする。
 *
 * 注意: リロード・別タブには引き継がれない（サーバー側に状態を持たないため）。
 */

import { createStore } from '@/lib/store/createStore';

/**
 * レコメンド更新ストアの状態
 */
export interface RecommendationRefreshState {
  /** 更新処理が進行中かどうか */
  isRefreshing: boolean;
  /** 更新開始を記録する */
  startRefresh: () => void;
  /** 更新終了を記録する */
  endRefresh: () => void;
}

/**
 * レコメンド更新の進行状態ストア
 */
export const useRecommendationRefreshStore =
  createStore<RecommendationRefreshState>('recommendationRefresh', (set) => ({
    isRefreshing: false,
    startRefresh: () => set({ isRefreshing: true }),
    endRefresh: () => set({ isRefreshing: false }),
  }));
