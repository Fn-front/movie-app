/**
 * Loadingコンポーネント
 */

'use client';

import { type HTMLAttributes, memo } from 'react';

import styles from './loading.module.scss';

/**
 * Loadingのサイズ型
 */
export type LoadingSize = 'sm' | 'md' | 'lg';

/**
 * Loadingコンポーネントのプロパティ
 */
export interface LoadingProps extends HTMLAttributes<HTMLDivElement> {
  /** サイズ */
  size?: LoadingSize;
  /** ラベル */
  label?: string;
  /** フルスクリーンオーバーレイ */
  fullScreen?: boolean;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Loadingコンポーネント
 *
 * @example
 * ```tsx
 * <Loading size="md" label="読み込み中..." />
 * ```
 *
 * @example
 * ```tsx
 * <Loading fullScreen label="データを取得中..." />
 * ```
 */
export const Loading = memo<LoadingProps>(function Loading({
  size = 'md',
  label,
  fullScreen = false,
  className,
  ...props
}) {
  const spinnerClassNames = [
    styles.c_loading__spinner,
    styles[`c_loading__spinner__${size}`],
  ]
    .filter(Boolean)
    .join(' ');

  const wrapperClassNames = [
    styles.c_loading,
    fullScreen && styles.c_loading__fullscreen,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <div className={spinnerClassNames} role='status' aria-live='polite'>
        <svg viewBox='0 0 50 50' xmlns='http://www.w3.org/2000/svg'>
          <circle
            className={styles.c_loading__circle}
            cx='25'
            cy='25'
            r='20'
            fill='none'
            strokeWidth='4'
          />
        </svg>
      </div>
      {label && <p className={styles.c_loading__label}>{label}</p>}
    </>
  );

  if (fullScreen) {
    return (
      <div className={wrapperClassNames} {...props}>
        <div className={styles.c_loading__overlay} />
        <div className={styles.c_loading__content}>{content}</div>
      </div>
    );
  }

  return (
    <div className={wrapperClassNames} {...props}>
      {content}
    </div>
  );
});

Loading.displayName = 'Loading';
