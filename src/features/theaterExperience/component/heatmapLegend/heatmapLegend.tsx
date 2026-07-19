/**
 * HeatmapLegendコンポーネント
 * 音響ヒートマップのカラーマップ（viridis）と相対音圧スケールの凡例。
 * 色のみに依存せず数値ラベルで強度を読めるようにする（色覚多様性への配慮）。
 */

'use client';

import { memo } from 'react';

import { cn } from '@/utils/cn';

import styles from './heatmapLegend.module.scss';

export interface HeatmapLegendProps {
  /** 追加クラス名 */
  className?: string;
}

export const HeatmapLegend = memo<HeatmapLegendProps>(function HeatmapLegend({
  className,
}) {
  return (
    <div
      className={cn(styles.c_heatmap_legend, className)}
      role='group'
      aria-label='音響ヒートマップの凡例'
    >
      <span className={styles.c_heatmap_legend__title}>相対音圧（正規化）</span>
      <div className={styles.c_heatmap_legend__bar} aria-hidden='true' />
      <div className={styles.c_heatmap_legend__ticks}>
        <span className={styles.c_heatmap_legend__tick}>弱 0%</span>
        <span className={styles.c_heatmap_legend__tick}>50%</span>
        <span className={styles.c_heatmap_legend__tick}>強 100%</span>
      </div>
    </div>
  );
});

HeatmapLegend.displayName = 'HeatmapLegend';
