/**
 * RatingIndicatorコンポーネント
 * 1〜10点の数値インジケーター
 */

'use client';

import { memo, useCallback } from 'react';

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
  /**
   * 点数のチップ1つだけを出す（既定: false）
   *
   * 10個のチップは `sm` でも 258px 要る。リスト行の情報欄は 375px 幅で
   * 213px しかなく、入れると**幅だけが縮んで非正方形に潰れ**（実測 24px →
   * 21.5px、320px では 16px）、同じ行の公開日が 0px まで押し出される（#1049 / #1050）。
   *
   * ⚠️ **表示専用。** `onRatingChange` と併用しても無視される（10段階から
   * 選ぶ操作をチップ1つでは表現できない）。リスト行の編集は、行の右端の
   * お気に入りボタンが開く評価モーダルが担う
   */
  compact?: boolean;
}

const ratings = Array.from(
  { length: FAVORITES_RATING_MAX - FAVORITES_RATING_MIN + 1 },
  (_, i) => i + FAVORITES_RATING_MIN,
);

/**
 * RatingIndicatorコンポーネント
 */
export const RatingIndicator = memo<RatingIndicatorProps>(
  function RatingIndicator({
    rating,
    onRatingChange,
    size = 'md',
    compact = false,
  }) {
    const interactive = !!onRatingChange;
    // 10段階から選ぶ操作はチップ1つでは表せないので、選べるときは必ず全段階を出す
    const isCompact = compact && !interactive;

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

    const sizeClassName =
      size === 'sm'
        ? styles.c_rating_indicator__sm
        : styles.c_rating_indicator__md;

    return (
      <div
        className={`${styles.c_rating_indicator} ${sizeClassName}`}
        role={interactive ? 'radiogroup' : 'img'}
        aria-label={
          interactive ? '評価を選択' : `評価: ${rating}/${FAVORITES_RATING_MAX}`
        }
      >
        {isCompact ? (
          // 読み上げは親の aria-label（`評価: 8/10`）が担う。
          // チップの数字だけを読ませると「/10」が落ちて意味が変わる
          <span
            className={`${styles.c_rating_indicator__item} ${styles.c_rating_indicator__item__active} ${styles.c_rating_indicator__item__selected}`}
            aria-hidden='true'
          >
            {rating}
          </span>
        ) : (
          ratings.map((value) => {
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
          })
        )}
      </div>
    );
  },
);

RatingIndicator.displayName = 'RatingIndicator';
