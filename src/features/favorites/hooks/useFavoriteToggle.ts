/**
 * お気に入りトグル カスタムフック
 * useFavorites + モーダル状態管理を統合
 */

import { useCallback, useMemo, useState } from 'react';

import { useFavorites } from '@/features/favorites/hooks/useFavorites';
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
  /** 登録ハンドラー（モーダルから呼ばれる） */
  handleSubmit: (rating: number) => void;
  /** 更新ハンドラー（モーダルから呼ばれる） */
  handleUpdate: (rating: number) => void;
  /** 削除ハンドラー（モーダルから呼ばれる） */
  handleDelete: () => void;
  /** 処理中かどうか */
  isProcessing: boolean;
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
    isAdding,
    isUpdating,
    isRemoving,
  } = useFavorites();

  const [modalState, setModalState] =
    useState<FavoriteModalState>(INITIAL_MODAL_STATE);

  const handleFavoriteToggle = useCallback(
    (movie: FavoriteToggleMovie, favorite: MovieFavoriteInfo | null) => {
      setModalState({
        isOpen: true,
        movie,
        currentFavorite: favorite ?? null,
      });
    },
    [],
  );

  const closeModal = useCallback(() => {
    setModalState(INITIAL_MODAL_STATE);
  }, []);

  const handleSubmit = useCallback(
    (rating: number) => {
      if (!modalState.movie) return;
      addToFavorites({
        tmdb_movie_id: modalState.movie.id,
        title: modalState.movie.title,
        poster_path: modalState.movie.poster_path,
        release_date: modalState.movie.release_date,
        rating,
      });
      closeModal();
    },
    [modalState.movie, addToFavorites, closeModal],
  );

  const handleUpdate = useCallback(
    (rating: number) => {
      if (!modalState.currentFavorite) return;
      updateRating(modalState.currentFavorite.id, rating);
      closeModal();
    },
    [modalState.currentFavorite, updateRating, closeModal],
  );

  const handleDelete = useCallback(() => {
    if (!modalState.currentFavorite) return;
    removeFromFavorites(modalState.currentFavorite.id);
    closeModal();
  }, [modalState.currentFavorite, removeFromFavorites, closeModal]);

  return useMemo(
    () => ({
      modalState,
      handleFavoriteToggle,
      closeModal,
      handleSubmit,
      handleUpdate,
      handleDelete,
      isProcessing: isAdding || isUpdating || isRemoving,
    }),
    [
      modalState,
      handleFavoriteToggle,
      closeModal,
      handleSubmit,
      handleUpdate,
      handleDelete,
      isAdding,
      isUpdating,
      isRemoving,
    ],
  );
}
