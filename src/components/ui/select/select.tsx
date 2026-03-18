/**
 * Selectコンポーネント
 */

'use client';

import { forwardRef, memo } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

import { cn } from '@/utils/cn';
import { useFormField } from '@/hooks/useFormField';
import { FormFieldMessage } from '@/components/ui/formFieldMessage/formFieldMessage';

import styles from './select.module.scss';

/**
 * 選択肢の型
 */
export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

/**
 * Selectコンポーネントのプロパティ
 */
export interface SelectProps {
  /** ラベル */
  label?: string;
  /** エラーメッセージ */
  error?: string;
  /** ヘルパーテキスト */
  helperText?: string;
  /** 全幅表示 */
  fullWidth?: boolean;
  /** 選択肢 */
  options: readonly SelectOption[];
  /** プレースホルダー */
  placeholder?: string;
  /** 選択された値 */
  value?: string;
  /** 値変更時のコールバック */
  onValueChange?: (value: string) => void;
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
 * Selectコンポーネント（内部実装）
 */
const SelectComponent = forwardRef<HTMLButtonElement, SelectProps>(
  function SelectComponent(
    {
      label,
      error,
      helperText,
      fullWidth = false,
      options,
      placeholder = '選択してください',
      value,
      onValueChange,
      disabled = false,
      required = false,
      id,
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) {
    const { fieldId, errorId, helperId, hasError, ariaDescribedBy } =
      useFormField({ id, fieldType: 'select', error, helperText });

    const wrapperClassNames = cn(
      styles.c_select,
      fullWidth && styles.c_select__full_width,
      className,
    );

    const triggerClassNames = cn(
      styles.c_select__trigger,
      hasError && styles.c_select__trigger__error,
      disabled && styles.c_select__trigger__disabled,
    );

    return (
      <div className={wrapperClassNames}>
        {label && (
          <label htmlFor={fieldId} className={styles.c_select__label}>
            {label}
            {required && <span className={styles.c_select__required}>*</span>}
          </label>
        )}

        <SelectPrimitive.Root
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            id={fieldId}
            className={triggerClassNames}
            aria-label={ariaLabel || label}
            aria-invalid={hasError}
            aria-describedby={ariaDescribedBy}
          >
            <SelectPrimitive.Value placeholder={placeholder} />
            <SelectPrimitive.Icon className={styles.c_select__icon}>
              <svg
                width='12'
                height='8'
                viewBox='0 0 12 8'
                fill='none'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path
                  d='M1 1.5L6 6.5L11 1.5'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              className={styles.c_select__content}
              position='popper'
            >
              <SelectPrimitive.Viewport className={styles.c_select__viewport}>
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={styles.c_select__item}
                  >
                    <SelectPrimitive.ItemText>
                      {option.label}
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator
                      className={styles.c_select__item_indicator}
                    >
                      <svg
                        width='16'
                        height='16'
                        viewBox='0 0 16 16'
                        fill='none'
                        xmlns='http://www.w3.org/2000/svg'
                      >
                        <path
                          d='M13.3333 4L6 11.3333L2.66666 8'
                          stroke='currentColor'
                          strokeWidth='2'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                      </svg>
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>

        <FormFieldMessage
          error={error}
          helperText={helperText}
          errorId={errorId}
          helperId={helperId}
          errorClassName={styles.c_select__error}
          helperClassName={styles.c_select__helper}
        />
      </div>
    );
  },
);

/**
 * Selectコンポーネント
 *
 * @example
 * ```tsx
 * <Select
 *   label="カテゴリー"
 *   options={[
 *     { label: 'アクション', value: 'action' },
 *     { label: 'コメディ', value: 'comedy' },
 *   ]}
 *   value={selectedCategory}
 *   onValueChange={setSelectedCategory}
 *   error={errors.category?.message}
 * />
 * ```
 */
export const Select = memo(SelectComponent);

Select.displayName = 'Select';
