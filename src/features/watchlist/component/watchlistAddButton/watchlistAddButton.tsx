/**
 * WatchlistAddButtonコンポーネント
 * ウォッチリスト追加/削除のトグルボタン（プラスアイコン / チェックアイコン切替）
 */

'use client';

import { memo, useCallback } from 'react';
import { IoAdd, IoCheckmark } from 'react-icons/io5';

import styles from './watchlistAddButton.module.scss';

/**
 * WatchlistAddButtonコンポーネントのプロパティ
 */
export interface WatchlistAddButtonProps {
  /** ウォッチリストに追加済みかどうか */
  isInWatchlist: boolean;
  /** クリック時のコールバック */
  onClick: () => void;
  /** 無効化 */
  disabled?: boolean;
  /** サイズ */
  size?: 'sm' | 'md';
}

/**
 * WatchlistAddButtonコンポーネント
 */
export const WatchlistAddButton = memo<WatchlistAddButtonProps>(
  function WatchlistAddButton({
    isInWatchlist,
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
      size === 'md'
        ? styles.c_watchlist_add_button__md
        : styles.c_watchlist_add_button__sm;

    return (
      <button
        type='button'
        className={`${styles.c_watchlist_add_button} ${sizeClassName} ${isInWatchlist ? styles.c_watchlist_add_button__active : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={
          isInWatchlist
            ? 'ウォッチリストから削除'
            : 'ウォッチリストに追加'
        }
      >
        {isInWatchlist ? <IoCheckmark /> : <IoAdd />}
      </button>
    );
  },
);

WatchlistAddButton.displayName = 'WatchlistAddButton';
