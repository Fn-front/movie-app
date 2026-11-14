/**
 * FavoriteButtonコンポーネント
 * ハートアイコンでお気に入り状態を表示・トグル
 */

'use client';

import { memo, useCallback } from 'react';
import { IoHeart, IoHeartOutline } from 'react-icons/io5';

import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
import { cn } from '@/utils/cn';

import styles from './favoriteButton.module.scss';

/**
 * FavoriteButtonコンポーネントのプロパティ
 */
export interface FavoriteButtonProps {
  /** お気に入り情報（nullの場合は未登録） */
  favorite: MovieFavoriteInfo | null;
  /** クリック時のコールバック */
  onClick: () => void;
  /** 無効化 */
  disabled?: boolean;
  /** サイズ */
  size?: 'sm' | 'md';
  /**
   * 登録状況がまだ分からない（既定: false）
   *
   * `favorite` が null でも「未登録」とは限らず、照会が終わっていない
   * だけのことがある（`useFavoriteLookup` の `isResolving`）。その間に
   * 空のハートを出すと、確定後に一斉に塗りつぶされる（#1135）
   */
  isResolving?: boolean;
}

/**
 * FavoriteButtonコンポーネント
 */
export const FavoriteButton = memo<FavoriteButtonProps>(
  function FavoriteButton({
    favorite,
    onClick,
    disabled = false,
    size = 'sm',
    isResolving = false,
  }) {
    const isFavorite = favorite !== null;

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onClick();
      },
      [onClick],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }
      },
      [onClick],
    );

    const sizeClassName =
      size === 'md'
        ? styles.c_favorite_button__md
        : styles.c_favorite_button__sm;

    return (
      <button
        type='button'
        className={cn(
          styles.c_favorite_button,
          sizeClassName,
          isFavorite && styles.c_favorite_button__active,
          isResolving && styles['c_favorite_button--resolving'],
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={isFavorite ? 'お気に入りを編集' : 'お気に入りに追加'}
      >
        {isFavorite ? <IoHeart /> : <IoHeartOutline />}
      </button>
    );
  },
);

FavoriteButton.displayName = 'FavoriteButton';
