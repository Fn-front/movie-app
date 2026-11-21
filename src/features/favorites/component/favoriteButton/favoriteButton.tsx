/**
 * FavoriteButtonコンポーネント
 * ハートアイコンでお気に入り状態を表示・トグル
 */

'use client';

import { memo, useCallback } from 'react';
import { IoHeart, IoHeartOutline } from 'react-icons/io5';

import { MOVIE_ACTION_LABELS, MOVIE_ACTION_TEXT } from '@/constants';
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
  /**
   * アクセシブルネームに含める作品名（#1047）
   *
   * ⛔ **一覧では必ず渡す。** 同じ名前のボタンが最大20個並ぶため、
   * 要素リストのように文脈から切り離して読むモードでは、どの作品への
   * 操作か分からない。
   *
   * ⚠️ 詳細モーダルでは渡さない（1作品しか無いので冗長なだけ）。
   */
  movieTitle?: string;
  /**
   * 可視ラベルを添えるか（既定: false / #1030）
   *
   * ウォッチリストと並ぶとどちらも「保存」に見えて区別できないため、幅に
   * 余裕のある**リスト行でだけ**言葉にする。グリッドのカード上は情報量を
   * 圧迫するので渡さない。
   *
   * ラベルは `aria-hidden` にする。`aria-label` が既にアクセシブルネームを
   * 決めており（作品名＋操作）、`aria-label` を持つ要素の中身はそもそも
   * 読み上げられないため、明示して意図を残している。
   */
  showLabel?: boolean;
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
    movieTitle,
    showLabel = false,
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
          showLabel && styles['c_favorite_button--with_label'],
          isFavorite && styles.c_favorite_button__active,
          isResolving && styles['c_favorite_button--resolving'],
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={
          isFavorite
            ? MOVIE_ACTION_LABELS.favoriteEdit(movieTitle)
            : MOVIE_ACTION_LABELS.favoriteAdd(movieTitle)
        }
      >
        {isFavorite ? <IoHeart /> : <IoHeartOutline />}
        {showLabel && (
          <span className={styles.c_favorite_button__label} aria-hidden='true'>
            {MOVIE_ACTION_TEXT.FAVORITE}
          </span>
        )}
      </button>
    );
  },
);

FavoriteButton.displayName = 'FavoriteButton';
