/**
 * SeatInfoPanelコンポーネント
 * 選択中の座席の視野占有率・距離・歪みスコアを表示
 */

'use client';

import { memo, useMemo } from 'react';

import { cn } from '@/utils/cn';

import type { TheaterSeat, Theater, FieldOfViewMetrics } from '../../types';
import { DistortionPreview } from '../distortionPreview/distortionPreview';

import styles from './seatInfoPanel.module.scss';

/** 推奨度レベル */
type RecommendationLevel = 'excellent' | 'good' | 'fair' | 'poor';

export interface SeatInfoPanelProps {
  /** 選択中の座席 */
  seat: TheaterSeat | null;
  /** 視野メトリクス */
  fovMetrics: FieldOfViewMetrics | null;
  /** 劇場データ（歪みプレビュー用） */
  theater?: Theater;
  /** 追加クラス名 */
  className?: string;
}

/**
 * 歪みスコアから推奨度を算出
 */
function getRecommendation(metrics: FieldOfViewMetrics): RecommendationLevel {
  const { distortion_score, horizontal_ratio } = metrics;

  if (distortion_score <= 0.15 && horizontal_ratio >= 0.3) return 'excellent';
  if (distortion_score <= 0.3 && horizontal_ratio >= 0.2) return 'good';
  if (distortion_score <= 0.5) return 'fair';
  return 'poor';
}

const RECOMMENDATION_LABELS: Record<RecommendationLevel, string> = {
  excellent: '最適',
  good: '良好',
  fair: '普通',
  poor: '非推奨',
};

export const SeatInfoPanel = memo<SeatInfoPanelProps>(function SeatInfoPanel({
  seat,
  fovMetrics,
  theater,
  className,
}) {
  const recommendation = useMemo(() => {
    if (!fovMetrics) return null;
    return getRecommendation(fovMetrics);
  }, [fovMetrics]);

  if (!seat) {
    return (
      <div
        className={cn(
          styles.c_seat_info_panel,
          styles.c_seat_info_panel__empty,
          className,
        )}
        role='region'
        aria-label='座席情報'
      >
        <p className={styles.c_seat_info_panel__placeholder}>
          座席を選択してください
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(styles.c_seat_info_panel, className)}
      role='region'
      aria-label='座席情報'
      aria-live='polite'
    >
      <div className={styles.c_seat_info_panel__header}>
        <h2 className={styles.c_seat_info_panel__title}>
          {seat.row_label}列 {seat.seat_number}番
        </h2>
        {recommendation && (
          <span
            className={cn(
              styles.c_seat_info_panel__badge,
              styles[`c_seat_info_panel__badge__${recommendation}`],
            )}
          >
            {RECOMMENDATION_LABELS[recommendation]}
          </span>
        )}
      </div>

      {fovMetrics && (
        <dl className={styles.c_seat_info_panel__metrics}>
          <div className={styles.c_seat_info_panel__metric}>
            <dt className={styles.c_seat_info_panel__metric_label}>
              スクリーン距離
            </dt>
            <dd className={styles.c_seat_info_panel__metric_value}>
              {fovMetrics.distance_to_screen.toFixed(1)} m
            </dd>
          </div>
          <div className={styles.c_seat_info_panel__metric}>
            <dt className={styles.c_seat_info_panel__metric_label}>
              水平視野占有率
            </dt>
            <dd className={styles.c_seat_info_panel__metric_value}>
              {(fovMetrics.horizontal_ratio * 100).toFixed(1)}%
            </dd>
          </div>
          <div className={styles.c_seat_info_panel__metric}>
            <dt className={styles.c_seat_info_panel__metric_label}>
              垂直視野占有率
            </dt>
            <dd className={styles.c_seat_info_panel__metric_value}>
              {(fovMetrics.vertical_ratio * 100).toFixed(1)}%
            </dd>
          </div>
          <div className={styles.c_seat_info_panel__metric}>
            <dt className={styles.c_seat_info_panel__metric_label}>
              歪みスコア
            </dt>
            <dd className={styles.c_seat_info_panel__metric_value}>
              {(fovMetrics.distortion_score * 100).toFixed(0)}%
            </dd>
          </div>
        </dl>
      )}

      {theater && <DistortionPreview seat={seat} theater={theater} />}
    </div>
  );
});

SeatInfoPanel.displayName = 'SeatInfoPanel';
