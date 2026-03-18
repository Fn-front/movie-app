/**
 * Inputコンポーネント
 */

'use client';

import {
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  memo,
} from 'react';

import { cn } from '@/utils/cn';
import { useFormField } from '@/hooks/useFormField';
import { FormFieldMessage } from '@/components/ui/formFieldMessage/formFieldMessage';

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
    const { fieldId, errorId, helperId, hasError, ariaDescribedBy } =
      useFormField({ id, fieldType: 'input', error, helperText });

    const inputClassNames = cn(
      styles.c_input__field,
      hasError && styles.c_input__field__error,
      leftIcon && styles.c_input__field__with_left_icon,
      rightIcon && styles.c_input__field__with_right_icon,
      disabled && styles.c_input__field__disabled,
    );

    const wrapperClassNames = cn(
      styles.c_input,
      fullWidth && styles.c_input__full_width,
      className,
    );

    return (
      <div className={wrapperClassNames}>
        {label && (
          <label htmlFor={fieldId} className={styles.c_input__label}>
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
            id={fieldId}
            className={inputClassNames}
            disabled={disabled}
            aria-label={ariaLabel || label}
            aria-invalid={hasError}
            aria-describedby={ariaDescribedBy}
            {...props}
          />

          {rightIcon && (
            <span className={styles.c_input__icon__right} aria-hidden='true'>
              {rightIcon}
            </span>
          )}
        </div>

        <FormFieldMessage
          error={error}
          helperText={helperText}
          errorId={errorId}
          helperId={helperId}
          errorClassName={styles.c_input__error}
          helperClassName={styles.c_input__helper}
        />
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
