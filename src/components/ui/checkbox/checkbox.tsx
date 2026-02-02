/**
 * Checkboxコンポーネント
 */

'use client';

import { type ReactNode, forwardRef, memo } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

import styles from './checkbox.module.scss';

/**
 * Checkboxコンポーネントのプロパティ
 */
export interface CheckboxProps {
  /** ラベル */
  label?: string;
  /** チェック状態 */
  checked?: boolean;
  /** チェック状態変更時のコールバック */
  onCheckedChange?: (checked: boolean) => void;
  /** 無効状態 */
  disabled?: boolean;
  /** 必須フィールド */
  required?: boolean;
  /** ID */
  id?: string;
  /** カスタムクラス名 */
  className?: string;
  /** aria-label */
  'aria-label'?: string;
}

/**
 * Checkboxコンポーネント（内部実装）
 */
const CheckboxComponent = forwardRef<HTMLButtonElement, CheckboxProps>(
  function CheckboxComponent(
    {
      label,
      checked,
      onCheckedChange,
      disabled = false,
      required = false,
      id,
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    const wrapperClassNames = [styles.c_checkbox, className].filter(Boolean).join(' ');

    return (
      <div className={wrapperClassNames}>
        <CheckboxPrimitive.Root
          ref={ref}
          id={checkboxId}
          className={styles.c_checkbox__root}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel || label}
        >
          <CheckboxPrimitive.Indicator className={styles.c_checkbox__indicator}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M10 3L4.5 8.5L2 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>

        {label && (
          <label htmlFor={checkboxId} className={styles.c_checkbox__label}>
            {label}
            {required && <span className={styles.c_checkbox__required}>*</span>}
          </label>
        )}
      </div>
    );
  },
);

/**
 * Checkboxコンポーネント
 *
 * @example
 * ```tsx
 * <Checkbox
 *   label="利用規約に同意する"
 *   checked={agreed}
 *   onCheckedChange={setAgreed}
 *   required
 * />
 * ```
 */
export const Checkbox = memo(CheckboxComponent);

Checkbox.displayName = 'Checkbox';
