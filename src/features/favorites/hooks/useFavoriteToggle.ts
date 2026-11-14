/**
 * お気に入りトグル カスタムフック
 * useFavorites + モーダル状態管理を統合
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { ANALYTICS_EVENTS } from '@/constants';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useFavoriteMutations } from '@/features/favorites/hooks/useFavoriteMutations';
import { useFavoriteLookup } from '@/features/favorites/hooks/useFavoriteLookup';
import { useLoginPromptStore } from '@/lib/store/useLoginPromptStore';
import { sendEvent } from '@/utils/analytics';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';

/**
 * トグル対象の映画データ
 */
export interface FavoriteToggleMovie {
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
 * モーダル状態
 */
export interface FavoriteModalState {
  /** モーダル表示フラグ */
  isOpen: boolean;
  /** 対象の映画 */
  movie: FavoriteToggleMovie | null;
  /** 現在のお気に入り情報（登録済みの場合） */
  currentFavorite: MovieFavoriteInfo | null;
}

/**
 * useFavoriteToggleフックの返り値
 */
export interface UseFavoriteToggleReturn {
  /** モーダル状態 */
  modalState: FavoriteModalState;
  /** お気に入りボタンクリック時のハンドラー */
  handleFavoriteToggle: (
    movie: FavoriteToggleMovie,
    favorite: MovieFavoriteInfo | null,
  ) => void;
  /** モーダルを閉じる */
  closeModal: () => void;
  /** モーダル送信ハンドラー（currentFavoriteの有無で登録/更新を自動判定） */
  handleModalSubmit: (rating: number) => void;
  /** 削除ハンドラー（モーダルから呼ばれる） */
  handleDelete: () => void;
  /** 処理中かどうか */
  isProcessing: boolean;
  /** 指定映画が処理中かどうか（per-movie無効化用） */
  isFavoriteProcessing: (tmdbMovieId: number) => boolean;
  /** 指定映画のお気に入り情報を取得（未登録ならnull） */
  getFavoriteInfo: (tmdbMovieId: number) => MovieFavoriteInfo | null;
  /**
   * お気に入りの登録状況がまだ分からない
   *
   * `getFavoriteInfo` は「まだ取れていない」と「登録されていない」を
   * どちらも `null` で返す。この値が `true` の間は未登録として
   * 描いてはいけない（#1135）
   */
  isFavoriteResolving: boolean;
}

const INITIAL_MODAL_STATE: FavoriteModalState = {
  isOpen: false,
  movie: null,
  currentFavorite: null,
};

/**
 * お気に入りトグル カスタムフック
 */
export function useFavoriteToggle(): UseFavoriteToggleReturn {
  // 一覧（useFavorites）ではなく書き込みだけを取る。
  // この経路は一覧を読まないので、誰も参照しない
  // `GET /api/favorites?page=1` を走らせないため
  const {
    addToFavorites,
    updateRating,
    removeFromFavorites,
    isAdding,
    isUpdating,
    isRemoving,
  } = useFavoriteMutations();

  // 登録済み判定は一覧（1ページ20件）ではなく専用の照会から引く。
  // 一覧から引くと21件目以降が未登録と判定されていた（#829）
  const { getFavoriteInfo, isResolving: isFavoriteResolving } =
    useFavoriteLookup();

  const { isAuthenticated, isResolving } = useAuthStatus();
  const openLoginPrompt = useLoginPromptStore((s) => s.open);

  const [modalState, setModalState] =
    useState<FavoriteModalState>(INITIAL_MODAL_STATE);

  const processingIdRef = useRef<number | null>(null);

  const handleFavoriteToggle = useCallback(
    (movie: FavoriteToggleMovie, favorite: MovieFavoriteInfo | null) => {
      // 未確定の間は誘導しない。ログイン済みの利用者がフルロード直後に
      // 押したときだけ「ログインが必要です」が出ていた（#1131）
      if (isResolving) return;

      if (!isAuthenticated) {
        openLoginPrompt('お気に入りに追加するにはログインが必要です。');
        return;
      }

      setModalState({
        isOpen: true,
        movie,
        currentFavorite: favorite ?? null,
      });
    },
    [isAuthenticated, isResolving, openLoginPrompt],
  );

  const closeModal = useCallback(() => {
    setModalState(INITIAL_MODAL_STATE);
  }, []);

  // 対象作品は冒頭で一度だけ解決する。分岐ごとに modalState.movie を
  // 見に行くと、登録は早期returnなのに更新・削除は計測だけ黙って落ちる、
  // という非対称な書き方になる（しかも両方とも到達不能な分岐が増える）
  const { movie, currentFavorite } = modalState;

  const handleModalSubmit = useCallback(
    (rating: number) => {
      if (!movie) return;

      processingIdRef.current = movie.id;

      // GA4 へは作品IDだけを送る。rating（★の数）は送らない。
      // Consent Mode advanced では未同意の利用者の分も Google へ届くため、
      // 作品に対する評価という嗜好情報を渡さない（#938）
      if (currentFavorite) {
        updateRating(currentFavorite.id, rating);
        sendEvent(ANALYTICS_EVENTS.FAVORITE_UPDATE, { movie_id: movie.id });
      } else {
        addToFavorites({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date,
          rating,
        });
        sendEvent(ANALYTICS_EVENTS.FAVORITE_ADD, { movie_id: movie.id });
      }
      closeModal();
    },
    [movie, currentFavorite, addToFavorites, updateRating, closeModal],
  );

  const handleDelete = useCallback(() => {
    if (!currentFavorite || !movie) return;

    processingIdRef.current = movie.id;
    removeFromFavorites(currentFavorite.id);
    sendEvent(ANALYTICS_EVENTS.FAVORITE_REMOVE, { movie_id: movie.id });
    closeModal();
  }, [currentFavorite, movie, removeFromFavorites, closeModal]);

  const isFavoriteProcessing = useCallback(
    (tmdbMovieId: number) =>
      (isAdding || isUpdating || isRemoving) &&
      processingIdRef.current === tmdbMovieId,
    [isAdding, isUpdating, isRemoving],
  );

  return useMemo(
    () => ({
      modalState,
      handleFavoriteToggle,
      closeModal,
      handleModalSubmit,
      handleDelete,
      isProcessing: isAdding || isUpdating || isRemoving,
      isFavoriteProcessing,
      getFavoriteInfo,
      isFavoriteResolving,
    }),
    [
      modalState,
      handleFavoriteToggle,
      closeModal,
      handleModalSubmit,
      handleDelete,
      isAdding,
      isUpdating,
      isRemoving,
      isFavoriteProcessing,
      getFavoriteInfo,
      isFavoriteResolving,
    ],
  );
}
