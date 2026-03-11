/**
 * RatingIndicatorコンポーネント
 * 1〜10点の数値インジケーター
 */

'use client';

import { memo, useCallback, useMemo } from 'react';

import { FAVORITES_RATING_MIN, FAVORITES_RATING_MAX } from '@/constants';

import styles from './ratingIndicator.module.scss';

/**
 * RatingIndicatorコンポーネントのプロパティ
 */
export interface RatingIndicatorProps {
  /** 現在の評価値 */
  rating: number;
  /** 評価変更時のコールバック（指定時はインタラクティブモード） */
  onRatingChange?: (rating: number) => void;
  /** サイズ */
  size?: 'sm' | 'md';
}

const ratings = Array.from(
  { length: FAVORITES_RATING_MAX - FAVORITES_RATING_MIN + 1 },
  (_, i) => i + FAVORITES_RATING_MIN,
);

/**
 * RatingIndicatorコンポーネント
 */
export const RatingIndicator = memo<RatingIndicatorProps>(
  function RatingIndicator({ rating, onRatingChange, size = 'md' }) {
    const interactive = !!onRatingChange;

    const handleClick = useCallback(
      (value: number) => {
        onRatingChange?.(value);
      },
      [onRatingChange],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent, value: number) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onRatingChange?.(value);
        }
      },
      [onRatingChange],
    );

    const sizeClassName = useMemo(
      () =>
        size === 'sm'
          ? styles.c_rating_indicator__sm
          : styles.c_rating_indicator__md,
      [size],
    );

    return (
      <div
        className={`${styles.c_rating_indicator} ${sizeClassName}`}
        role={interactive ? 'radiogroup' : 'img'}
        aria-label={
          interactive ? '評価を選択' : `評価: ${rating}/${FAVORITES_RATING_MAX}`
        }
      >
        {ratings.map((value) => {
          const isSelected = value === rating;
          const isActive = value <= rating;

          if (interactive) {
            return (
              <button
                key={value}
                type='button'
                className={`${styles.c_rating_indicator__item} ${isActive ? styles.c_rating_indicator__item__active : ''} ${isSelected ? styles.c_rating_indicator__item__selected : ''}`}
                onClick={() => handleClick(value)}
                onKeyDown={(e) => handleKeyDown(e, value)}
                role='radio'
                aria-checked={isSelected}
                aria-label={`${value}点`}
                tabIndex={isSelected ? 0 : -1}
              >
                {value}
              </button>
            );
          }

          return (
            <span
              key={value}
              className={`${styles.c_rating_indicator__item} ${isActive ? styles.c_rating_indicator__item__active : ''} ${isSelected ? styles.c_rating_indicator__item__selected : ''}`}
              aria-hidden='true'
            >
              {value}
            </span>
          );
        })}
      </div>
    );
  },
);

RatingIndicator.displayName = 'RatingIndicator';
