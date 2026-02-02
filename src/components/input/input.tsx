/**
 * Inputコンポーネント
 */

'use client';

import { type InputHTMLAttributes, type ReactNode, forwardRef, memo } from 'react';

import styles from './input.module.scss';

/**
 * Inputコンポーネントのプロパティ
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** ラベル */
  label?: string;
  /** エラーメッセージ */
  error?: string;
  /** ヘルパーテキスト */
  helperText?: string;
  /** 全幅表示 */
  fullWidth?: boolean;
  /** 左側アイコン */
  leftIcon?: ReactNode;
  /** 右側アイコン */
  rightIcon?: ReactNode;
}

/**
 * Inputコンポーネント（内部実装）
 */
const InputComponent = forwardRef<HTMLInputElement, InputProps>(
  function InputComponent(
    {
      label,
      error,
      helperText,
      fullWidth = false,
      leftIcon,
      rightIcon,
      className,
      id,
      disabled,
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const hasError = Boolean(error);

    const inputClassNames = [
      styles.c_input__field,
      hasError && styles.c_input__field__error,
      leftIcon && styles.c_input__field__with_left_icon,
      rightIcon && styles.c_input__field__with_right_icon,
      disabled && styles.c_input__field__disabled,
    ]
      .filter(Boolean)
      .join(' ');

    const wrapperClassNames = [
      styles.c_input,
      fullWidth && styles.c_input__full_width,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClassNames}>
        {label && (
          <label htmlFor={inputId} className={styles.c_input__label}>
            {label}
          </label>
        )}

        <div className={styles.c_input__wrapper}>
          {leftIcon && (
            <span className={styles.c_input__icon__left} aria-hidden='true'>
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={inputClassNames}
            disabled={disabled}
            aria-label={ariaLabel || label}
            aria-invalid={hasError}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                  ? `${inputId}-helper`
                  : undefined
            }
            {...props}
          />

          {rightIcon && (
            <span className={styles.c_input__icon__right} aria-hidden='true'>
              {rightIcon}
            </span>
          )}
        </div>

        {error && (
          <p
            id={`${inputId}-error`}
            className={styles.c_input__error}
            role='alert'
          >
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={`${inputId}-helper`} className={styles.c_input__helper}>
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

/**
 * Inputコンポーネント
 *
 * @example
 * ```tsx
 * <Input
 *   label="メールアドレス"
 *   type="email"
 *   placeholder="example@example.com"
 *   error={errors.email?.message}
 * />
 * ```
 */
export const Input = memo(InputComponent);

Input.displayName = 'Input';
