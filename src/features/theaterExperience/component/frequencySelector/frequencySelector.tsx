/**
 * FrequencySelectorコンポーネント
 * 低音/中音/高音の周波数帯を切り替えるトグルグループ
 */

'use client';

import { memo, useCallback } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';

import { cn } from '@/utils/cn';

import type { FrequencyBand } from '../../types';

import styles from './frequencySelector.module.scss';

const FREQUENCY_OPTIONS: readonly {
  value: FrequencyBand;
  label: string;
  frequency: string;
}[] = [
  { value: 'low', label: '低音', frequency: '80 Hz' },
  { value: 'mid', label: '中音', frequency: '1 kHz' },
  { value: 'high', label: '高音', frequency: '8 kHz' },
] as const;

export interface FrequencySelectorProps {
  /** 現在選択中の周波数帯 */
  value: FrequencyBand;
  /** 変更時コールバック */
  onValueChange: (value: FrequencyBand) => void;
  /** 追加クラス名 */
  className?: string;
}

export const FrequencySelector = memo<FrequencySelectorProps>(
  function FrequencySelector({ value, onValueChange, className }) {
    const handleValueChange = useCallback(
      (newValue: string) => {
        // 未選択状態を許可しない（同じボタンを再クリック時は無視）
        if (newValue) {
          onValueChange(newValue as FrequencyBand);
        }
      },
      [onValueChange],
    );

    return (
      <div className={cn(styles.c_frequency_selector, className)}>
        <span
          className={styles.c_frequency_selector__label}
          id='frequency-label'
        >
          周波数帯
        </span>
        <ToggleGroup.Root
          type='single'
          value={value}
          onValueChange={handleValueChange}
          aria-labelledby='frequency-label'
          className={styles.c_frequency_selector__group}
        >
          {FREQUENCY_OPTIONS.map((option) => (
            /*
              ⚠️ `aria-label` を付けないこと（#1106）。

              Radix の ToggleGroup（type='single'）は role="radio" を付ける。
              radio は name-from-content なので、名前は可視テキスト
              （`低音` + `80 Hz`）からそのまま作られる。

              以前は `低音（80 Hz）` を `aria-label` に入れていたが、
              axe の `label-content-name-mismatch` は NFKD 正規化で全角括弧を
              半角へ落としたあと**括弧内を除去**してから単語列を比較するため、
              名前側が `["低音"]`、可視側が `["低音","80","hz"]` となって
              一致しない（WCAG 2.5.3 Label in Name）。
              音声入力で「低音 80 ヘルツ」と読み上げても反応しない。

              ⚠️ 実測の結果は **violation ではなく incomplete**（要確認）。
              axe 4.14 の `valueTextRoles` に `radio` が含まれており、
              一致しなかった radio は判定が保留されるため。ただし共通ヘルパー
              `expectNoA11yViolations` は incomplete でも落とすので、
              #1065 で `/theater-experience` を a11y E2E に入れた時点で
              必ず赤くなる。

              ⚠️ 兄弟の OccupancySelector / HeatmapToggle は同じ書き方に
              見えるが問題ない。`客席を満席にする` は Intl.Segmenter で
              `["客席","を","満席","に","する"]` に分かれ、可視の `["満席"]` を
              連続部分列として含む（実測で passes に入ることを確認済み）。
              **括弧を使った本件だけ**が外れる。
            */
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              className={styles.c_frequency_selector__item}
            >
              <span className={styles.c_frequency_selector__item_label}>
                {option.label}
              </span>
              <span className={styles.c_frequency_selector__item_freq}>
                {option.frequency}
              </span>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>
    );
  },
);

FrequencySelector.displayName = 'FrequencySelector';
