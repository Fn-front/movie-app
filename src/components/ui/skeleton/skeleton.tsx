/**
 * Skeletonコンポーネント
 */

'use client';

import { type HTMLAttributes, memo } from 'react';

import styles from './skeleton.module.scss';

/**
 * Skeletonのバリアント型
 */
export type SkeletonVariant = 'text' | 'rect' | 'circle';

/**
 * Skeletonコンポーネントのプロパティ
 */
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** バリアント */
  variant?: SkeletonVariant;
  /** 幅 */
  width?: string | number;
  /** 高さ */
  height?: string | number;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Skeletonコンポーネント
 *
 * @example
 * ```tsx
 * <Skeleton variant="text" width="100%" height="20px" />
 * <Skeleton variant="rect" width="100%" height="200px" />
 * <Skeleton variant="circle" width="40px" height="40px" />
 * ```
 */
export const Skeleton = memo<SkeletonProps>(function Skeleton({
  variant = 'text',
  width,
  height,
  className,
  style,
  ...props
}) {
  const classNames = [
    styles.c_skeleton,
    styles[`c_skeleton__variant__${variant}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inlineStyles = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  return <div className={classNames} style={inlineStyles} {...props} />;
});

Skeleton.displayName = 'Skeleton';
