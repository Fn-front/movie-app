/**
 * 座席推奨度スコアリング
 *
 * 単純な閾値判定ではなく、近すぎ（占有率過大）/遠すぎ（占有率過小）を減点する
 * 山型スコアで席の見やすさを総合評価する。入力メトリクスは3D位置を考慮した
 * calcFieldOfViewMetrics（distortion_score は左右の斜め角＋見上げ角のkeystoneを含む）。
 */

import type { FieldOfViewMetrics } from '../types';

/** 推奨度レベル */
export type RecommendationLevel = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * 水平視野占有率(= 水平視野角 / π)のスイートスポット。
 * 人が快適に画面全体を捉えられる水平視野角の目安に基づく:
 * - 約30°(SMPTE下限)〜約54° を最良帯とする（ratio 0.167〜0.30）
 * - 約18°(ratio 0.10) 未満は「遠すぎ（画面が小さい）」で占有スコア0
 * - 約90°(ratio 0.50) 超は「近すぎ（画面が視界を溢れ首振りが過大）」で占有スコア0
 */
const H_IDEAL_LOW = 0.167;
const H_IDEAL_HIGH = 0.3;
const H_MIN = 0.1;
const H_MAX = 0.5;

/** 歪み(0〜1)がこの値以上で歪み品質を0とする */
const DISTORTION_MAX = 0.6;

/** 総合スコアの配分（占有率 : 歪み） */
const W_OCCUPANCY = 0.6;
const W_DISTORTION = 0.4;

/** 推奨度レベルの閾値（総合スコア 0〜1） */
const THRESHOLD_EXCELLENT = 0.8;
const THRESHOLD_GOOD = 0.6;
const THRESHOLD_FAIR = 0.4;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * 水平視野占有率から占有スコア（0〜1, 山型）を求める。
 * スイートスポット帯で1、近すぎ・遠すぎで0へ線形に減衰する。
 */
export function calcOccupancyScore(horizontalRatio: number): number {
  if (horizontalRatio >= H_IDEAL_LOW && horizontalRatio <= H_IDEAL_HIGH) {
    return 1;
  }
  if (horizontalRatio < H_IDEAL_LOW) {
    // 遠すぎ側: H_MIN で0 → H_IDEAL_LOW で1
    return clamp01((horizontalRatio - H_MIN) / (H_IDEAL_LOW - H_MIN));
  }
  // 近すぎ側: H_IDEAL_HIGH で1 → H_MAX で0
  return clamp01((H_MAX - horizontalRatio) / (H_MAX - H_IDEAL_HIGH));
}

/**
 * 総合スコア（0〜1）。占有スイートスポット＋歪み品質の加重和。
 * 前列中央は「占有率過大」と「見上げ歪み大」の両方で減点され、
 * 単純な閾値判定のように無条件で最高評価にはならない。
 */
export function calcSeatScore(metrics: FieldOfViewMetrics): number {
  const occupancy = calcOccupancyScore(metrics.horizontal_ratio);
  const distortionQuality = clamp01(
    1 - metrics.distortion_score / DISTORTION_MAX,
  );
  return occupancy * W_OCCUPANCY + distortionQuality * W_DISTORTION;
}

/**
 * 総合スコアから推奨度レベルを判定する。
 */
export function getRecommendation(
  metrics: FieldOfViewMetrics,
): RecommendationLevel {
  const score = calcSeatScore(metrics);
  if (score >= THRESHOLD_EXCELLENT) return 'excellent';
  if (score >= THRESHOLD_GOOD) return 'good';
  if (score >= THRESHOLD_FAIR) return 'fair';
  return 'poor';
}
