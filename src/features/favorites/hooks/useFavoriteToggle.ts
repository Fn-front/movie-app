/**
 * お気に入りトグル カスタムフック
 * useFavorites + モーダル状態管理を統合
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

import { useFavorites } from '@/features/favorites/hooks/useFavorites';
import { useLoginPromptStore } from '@/lib/store/useLoginPromptStore';
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
  const {
    addToFavorites,
    updateRating,
    removeFromFavorites,
    getFavoriteInfo,
    isAdding,
    isUpdating,
    isRemoving,
  } = useFavorites();

  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const openLoginPrompt = useLoginPromptStore((s) => s.open);

  const [modalState, setModalState] =
    useState<FavoriteModalState>(INITIAL_MODAL_STATE);

  const processingIdRef = useRef<number | null>(null);

  const handleFavoriteToggle = useCallback(
    (movie: FavoriteToggleMovie, favorite: MovieFavoriteInfo | null) => {
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
    [isAuthenticated, openLoginPrompt],
  );

  const closeModal = useCallback(() => {
    setModalState(INITIAL_MODAL_STATE);
  }, []);

  const handleModalSubmit = useCallback(
    (rating: number) => {
      if (modalState.movie) {
        processingIdRef.current = modalState.movie.id;
      }
      if (modalState.currentFavorite) {
        updateRating(modalState.currentFavorite.id, rating);
      } else {
        if (!modalState.movie) return;
        addToFavorites({
          tmdb_movie_id: modalState.movie.id,
          title: modalState.movie.title,
          poster_path: modalState.movie.poster_path,
          release_date: modalState.movie.release_date,
          rating,
        });
      }
      closeModal();
    },
    [
      modalState.movie,
      modalState.currentFavorite,
      addToFavorites,
      updateRating,
      closeModal,
    ],
  );

  const handleDelete = useCallback(() => {
    if (!modalState.currentFavorite) return;
    if (modalState.movie) {
      processingIdRef.current = modalState.movie.id;
    }
    removeFromFavorites(modalState.currentFavorite.id);
    closeModal();
  }, [
    modalState.currentFavorite,
    modalState.movie,
    removeFromFavorites,
    closeModal,
  ]);

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
    ],
  );
}
