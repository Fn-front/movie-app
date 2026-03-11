/**
 * FavoriteRatingModalコンポーネント
 * お気に入り登録・評価変更のモーダル
 */

'use client';

import { memo, useCallback, useState, useEffect } from 'react';

import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal/modal';
import { Button } from '@/components/ui/button/button';
import { RatingIndicator } from '@/features/favorites/component/ratingIndicator/ratingIndicator';
import { FAVORITES_RATING_MIN } from '@/constants';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';

import styles from './favoriteRatingModal.module.scss';

/**
 * FavoriteRatingModalコンポーネントのプロパティ
 */
export interface FavoriteRatingModalProps {
  /** モーダル表示状態 */
  isOpen: boolean;
  /** モーダルを閉じるコールバック */
  onClose: () => void;
  /** 映画タイトル */
  movieTitle: string;
  /** 現在のお気に入り情報（登録済みの場合） */
  currentFavorite: MovieFavoriteInfo | null;
  /** 登録・更新時のコールバック */
  onSubmit: (rating: number) => void;
  /** 削除時のコールバック */
  onDelete?: () => void;
}

const DEFAULT_RATING = 5;

/**
 * FavoriteRatingModalコンポーネント
 */
export const FavoriteRatingModal = memo<FavoriteRatingModalProps>(
  function FavoriteRatingModal({
    isOpen,
    onClose,
    movieTitle,
    currentFavorite,
    onSubmit,
    onDelete,
  }) {
    const isEditMode = currentFavorite !== null;
    const [rating, setRating] = useState<number>(DEFAULT_RATING);

    // モーダルが開くたびに評価値をリセット
    // isOpen変更時にサーバー状態（currentFavorite.rating）からローカル状態を初期化するためuseEffectが必要
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
      if (isOpen) {
        setRating(currentFavorite?.rating ?? DEFAULT_RATING);
      }
    }, [isOpen, currentFavorite]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) {
          onClose();
        }
      },
      [onClose],
    );

    const handleRatingChange = useCallback((value: number) => {
      setRating(value);
    }, []);

    const handleSubmit = useCallback(() => {
      onSubmit(rating);
    }, [onSubmit, rating]);

    const handleDelete = useCallback(() => {
      onDelete?.();
    }, [onDelete]);

    return (
      <Modal
        open={isOpen}
        onOpenChange={handleOpenChange}
        title={isEditMode ? 'お気に入りを編集' : 'お気に入りに追加'}
        size='sm'
      >
        <ModalBody>
          <div className={styles.c_favorite_rating_modal__content}>
            <p className={styles.c_favorite_rating_modal__movie_title}>
              {movieTitle}
            </p>
            <div className={styles.c_favorite_rating_modal__rating}>
              <span className={styles.c_favorite_rating_modal__rating_label}>
                評価
              </span>
              <RatingIndicator
                rating={rating}
                onRatingChange={handleRatingChange}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <div className={styles.c_favorite_rating_modal__actions}>
            {isEditMode && onDelete && (
              <Button variant='danger' size='sm' onClick={handleDelete}>
                削除
              </Button>
            )}
            <div className={styles.c_favorite_rating_modal__actions_right}>
              <Button variant='ghost' size='sm' onClick={onClose}>
                キャンセル
              </Button>
              <Button
                variant='primary'
                size='sm'
                onClick={handleSubmit}
                disabled={rating < FAVORITES_RATING_MIN}
              >
                {isEditMode ? '更新' : '登録'}
              </Button>
            </div>
          </div>
        </ModalFooter>
      </Modal>
    );
  },
);

FavoriteRatingModal.displayName = 'FavoriteRatingModal';
