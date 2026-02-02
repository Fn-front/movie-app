/**
 * Textareaコンポーネント
 */

'use client';

import { type TextareaHTMLAttributes, forwardRef, memo } from 'react';

import styles from './textarea.module.scss';

/**
 * Textareaコンポーネントのプロパティ
 */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** ラベル */
  label?: string;
  /** エラーメッセージ */
  error?: string;
  /** ヘルパーテキスト */
  helperText?: string;
  /** 全幅表示 */
  fullWidth?: boolean;
  /** 文字数カウント表示 */
  showCount?: boolean;
  /** 最大文字数 */
  maxLength?: number;
}

/**
 * Textareaコンポーネント（内部実装）
 */
const TextareaComponent = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function TextareaComponent(
    {
      label,
      error,
      helperText,
      fullWidth = false,
      showCount = false,
      maxLength,
      className,
      id,
      disabled,
      value,
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
    const hasError = Boolean(error);

    const currentLength = typeof value === 'string' ? value.length : 0;

    const textareaClassNames = [
      styles.c_textarea__field,
      hasError && styles.c_textarea__field__error,
      disabled && styles.c_textarea__field__disabled,
    ]
      .filter(Boolean)
      .join(' ');

    const wrapperClassNames = [
      styles.c_textarea,
      fullWidth && styles.c_textarea__full_width,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClassNames}>
        {label && (
          <label htmlFor={textareaId} className={styles.c_textarea__label}>
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          className={textareaClassNames}
          disabled={disabled}
          value={value}
          maxLength={maxLength}
          aria-label={ariaLabel || label}
          aria-invalid={hasError}
          aria-describedby={
            error
              ? `${textareaId}-error`
              : helperText
                ? `${textareaId}-helper`
                : undefined
          }
          {...props}
        />

        {showCount && maxLength && (
          <div className={styles.c_textarea__count}>
            {currentLength} / {maxLength}
          </div>
        )}

        {error && (
          <p id={`${textareaId}-error`} className={styles.c_textarea__error} role="alert">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={`${textareaId}-helper`} className={styles.c_textarea__helper}>
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

/**
 * Textareaコンポーネント
 *
 * @example
 * ```tsx
 * <Textarea
 *   label="レビュー"
 *   placeholder="映画の感想を書いてください"
 *   value={review}
 *   onChange={(e) => setReview(e.target.value)}
 *   maxLength={500}
 *   showCount
 *   error={errors.review?.message}
 * />
 * ```
 */
export const Textarea = memo(TextareaComponent);

Textarea.displayName = 'Textarea';
