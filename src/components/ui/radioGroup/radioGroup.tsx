/**
 * RadioGroupコンポーネント
 */

'use client';

import { memo, useId } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';

import styles from './radioGroup.module.scss';

/**
 * ラジオボタンの選択肢
 */
export interface RadioOption {
  label: string;
  value: string;
}

/**
 * RadioGroupコンポーネントのプロパティ
 */
export interface RadioGroupProps {
  /** 選択肢 */
  options: RadioOption[];
  /** 現在の値 */
  value: string;
  /** 値変更時のコールバック */
  onValueChange: (value: string) => void;
  /** aria-label */
  'aria-label'?: string;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * RadioGroupコンポーネント
 */
export const RadioGroup = memo<RadioGroupProps>(function RadioGroup({
  options,
  value,
  onValueChange,
  'aria-label': ariaLabel,
  className,
}) {
  const groupId = useId();

  const rootClassNames = [styles.c_radio_group, className]
    .filter(Boolean)
    .join(' ');

  return (
    <RadioGroupPrimitive.Root
      className={rootClassNames}
      value={value}
      onValueChange={onValueChange}
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const itemId = `${groupId}-${option.value}`;
        return (
          <div key={option.value} className={styles.c_radio_group__item}>
            <RadioGroupPrimitive.Item
              id={itemId}
              value={option.value}
              className={styles.c_radio_group__radio}
            >
              <RadioGroupPrimitive.Indicator
                className={styles.c_radio_group__indicator}
              />
            </RadioGroupPrimitive.Item>
            <label htmlFor={itemId} className={styles.c_radio_group__label}>
              {option.label}
            </label>
          </div>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
});

RadioGroup.displayName = 'RadioGroup';
