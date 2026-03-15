/**
 * DismissButtonコンポーネント
 * バツアイコンで興味なしを表示・トグル
 */

'use client';

import { memo, useCallback } from 'react';
import { IoThumbsDown } from 'react-icons/io5';

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
}

/**
 * DismissButtonコンポーネント
 */
export const DismissButton = memo<DismissButtonProps>(function DismissButton({
  onClick,
  disabled = false,
  size = 'sm',
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
      aria-label='興味なし'
    >
      <IoThumbsDown />
    </button>
  );
});

DismissButton.displayName = 'DismissButton';
