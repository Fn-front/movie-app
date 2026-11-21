/**
 * DismissButtonコンポーネント
 * バツアイコンで興味なしを表示・トグル
 */

'use client';

import { memo, useCallback } from 'react';
import { IoThumbsDown } from 'react-icons/io5';

import { MOVIE_ACTION_LABELS } from '@/constants/strings';

import styles from './dismissButton.module.scss';

/**
 * DismissButtonコンポーネントのプロパティ
 */
export interface DismissButtonProps {
  /** クリック時のコールバック */
  onClick: () => void;
  /** 無効化 */
  disabled?: boolean;
  /** サイズ */
  size?: 'sm' | 'md';
  /**
   * アクセシブルネームに含める作品名（#1047）
   *
   * ⚠️ 素の「興味なし」は**名詞**なので、作品名を足すときは動詞化する
   * （`${title}を興味なしにする`）。「○○を興味なし」は非文。
   */
  movieTitle?: string;
}

/**
 * DismissButtonコンポーネント
 */
export const DismissButton = memo<DismissButtonProps>(function DismissButton({
  onClick,
  disabled = false,
  size = 'sm',
  movieTitle,
}) {
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
    size === 'md' ? styles.c_dismiss_button__md : styles.c_dismiss_button__sm;

  return (
    <button
      type='button'
      className={`${styles.c_dismiss_button} ${sizeClassName}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-label={MOVIE_ACTION_LABELS.dismiss(movieTitle)}
    >
      <IoThumbsDown />
    </button>
  );
});

DismissButton.displayName = 'DismissButton';
