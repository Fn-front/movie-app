/**
 * Badgeコンポーネント
 */

'use client';

import { type HTMLAttributes, type ReactNode, memo } from 'react';

import { cn } from '@/utils/cn';

import styles from './badge.module.scss';

/**
 * Badgeのバリアント型
 */
export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'error'
  | 'warning';

/**
 * Badgeのサイズ型
 */
export type BadgeSize = 'sm' | 'md';

/**
 * Badgeコンポーネントのプロパティ
 */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** バッジの内容 */
  children: ReactNode;
  /** バリアント */
  variant?: BadgeVariant;
  /** サイズ */
  size?: BadgeSize;
  /** 削除ボタン */
  onRemove?: () => void;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Badgeコンポーネント
 *
 * @example
 * ```tsx
 * <Badge variant="primary">アクション</Badge>
 * ```
 *
 * @example
 * ```tsx
 * <Badge variant="default" onRemove={handleRemove}>
 *   フィルター: 2024
 * </Badge>
 * ```
 */
export const Badge = memo<BadgeProps>(function Badge({
  children,
  variant = 'default',
  size = 'md',
  onRemove,
  className,
  ...props
}) {
  const classNames = cn(
    styles.c_badge,
    styles[`c_badge__variant__${variant}`],
    styles[`c_badge__size__${size}`],
    onRemove && styles.c_badge__removable,
    className,
  );

  return (
    <span className={classNames} {...props}>
      <span className={styles.c_badge__content}>{children}</span>
      {onRemove && (
        <button
          type='button'
          className={styles.c_badge__remove}
          onClick={onRemove}
          aria-label='削除'
        >
          <svg
            width='12'
            height='12'
            viewBox='0 0 12 12'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            aria-hidden='true'
          >
            <path
              d='M9 3L3 9M3 3L9 9'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        </button>
      )}
    </span>
  );
});

Badge.displayName = 'Badge';
