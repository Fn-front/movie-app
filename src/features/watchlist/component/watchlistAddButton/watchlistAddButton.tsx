/**
 * WatchlistAddButtonコンポーネント
 * ウォッチリスト追加/削除のトグルボタン（プラスアイコン / チェックアイコン切替）
 */

'use client';

import { memo, useCallback } from 'react';
import { IoAdd, IoCheckmark } from 'react-icons/io5';

import { cn } from '@/utils/cn';

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
  /**
   * 登録状況がまだ分からない（既定: false）
   *
   * `isInWatchlist` が false でも「未登録」とは限らず、照会が終わって
   * いないだけのことがある（`useWatchlistToggle` の
   * `isWatchlistResolving`）。その間に「＋」を出すと、登録済みの作品でも
   * 追加できるように見え、押すと成功トーストの直後に 409 のエラートーストが
   * 重なる（#1145）
   */
  isResolving?: boolean;
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
    isResolving = false,
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
        className={cn(
          styles.c_watchlist_add_button,
          sizeClassName,
          isInWatchlist && styles.c_watchlist_add_button__active,
          isResolving && styles['c_watchlist_add_button--resolving'],
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={
          isInWatchlist ? 'ウォッチリストから削除' : 'ウォッチリストに追加'
        }
      >
        {isInWatchlist ? <IoCheckmark /> : <IoAdd />}
      </button>
    );
  },
);

WatchlistAddButton.displayName = 'WatchlistAddButton';
