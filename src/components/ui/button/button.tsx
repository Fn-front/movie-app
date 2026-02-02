/**
 * Buttonコンポーネント
 */

'use client';

import { type ButtonHTMLAttributes, type ReactNode, memo } from 'react';

import styles from './button.module.scss';

/**
 * Buttonのバリアント型
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Buttonのサイズ型
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Buttonコンポーネントのプロパティ
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** ボタンのバリアント */
  variant?: ButtonVariant;
  /** ボタンのサイズ */
  size?: ButtonSize;
  /** ボタンの内容 */
  children: ReactNode;
  /** 全幅表示 */
  fullWidth?: boolean;
  /** ローディング状態 */
  isLoading?: boolean;
}

/**
 * Buttonコンポーネント
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   クリック
 * </Button>
 * ```
 */
export const Button = memo<ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  children,
  fullWidth = false,
  isLoading = false,
  className,
  disabled,
  type = 'button',
  ...props
}) {
  const classNames = [
    styles.c_button,
    styles[`c_button__variant__${variant}`],
    styles[`c_button__size__${size}`],
    fullWidth && styles.c_button__full_width,
    isLoading && styles.c_button__loading,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classNames}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className={styles.c_button__spinner} aria-hidden='true' />
      ) : null}
      <span className={isLoading ? styles.c_button__content__hidden : ''}>
        {children}
      </span>
    </button>
  );
});

Button.displayName = 'Button';
