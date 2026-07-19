/**
 * 座席推奨度スコアリング テスト
 */

import type { FieldOfViewMetrics } from '../types';

import { calcFieldOfViewMetrics } from './fieldOfView';
import {
  calcOccupancyScore,
  calcSeatScore,
  getRecommendation,
} from './seatRecommendation';

const metrics = (
  overrides: Partial<FieldOfViewMetrics> = {},
): FieldOfViewMetrics => ({
  horizontal_ratio: 0.25,
  vertical_ratio: 0.15,
  distance_to_screen: 12,
  distortion_score: 0.05,
  ...overrides,
});

describe('calcOccupancyScore', () => {
  it('スイートスポット帯(0.167〜0.30)では1', () => {
    expect(calcOccupancyScore(0.2)).toBe(1);
    expect(calcOccupancyScore(0.167)).toBe(1);
    expect(calcOccupancyScore(0.3)).toBe(1);
  });

  it('遠すぎ（占有率が低い）ほど減点、下限で0', () => {
    expect(calcOccupancyScore(0.1)).toBeCloseTo(0);
    expect(calcOccupancyScore(0.08)).toBe(0);
    // 帯の手前は0〜1の中間
    const mid = calcOccupancyScore(0.13);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('近すぎ（占有率が過大）ほど減点、上限で0', () => {
    expect(calcOccupancyScore(0.5)).toBeCloseTo(0);
    expect(calcOccupancyScore(0.66)).toBe(0);
    const mid = calcOccupancyScore(0.4);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('calcSeatScore / getRecommendation', () => {
  it('スイートスポット＋低歪みは最高スコア＝最適', () => {
    const m = metrics({ horizontal_ratio: 0.25, distortion_score: 0.05 });
    expect(calcSeatScore(m)).toBeGreaterThanOrEqual(0.8);
    expect(getRecommendation(m)).toBe('excellent');
  });

  it('近すぎ席（占有率過大）は最適にならない', () => {
    const m = metrics({ horizontal_ratio: 0.6, distortion_score: 0.5 });
    expect(getRecommendation(m)).not.toBe('excellent');
    expect(getRecommendation(m)).toBe('poor');
  });

  it('やや近い/やや外れた席は良好〜普通に収まる', () => {
    expect(
      getRecommendation(
        metrics({ horizontal_ratio: 0.35, distortion_score: 0.15 }),
      ),
    ).toBe('good');
    expect(
      getRecommendation(
        metrics({ horizontal_ratio: 0.4, distortion_score: 0.2 }),
      ),
    ).toBe('fair');
  });

  it('歪みが大きいほどスコアが下がる', () => {
    const low = calcSeatScore(metrics({ distortion_score: 0.05 }));
    const high = calcSeatScore(metrics({ distortion_score: 0.5 }));
    expect(high).toBeLessThan(low);
  });
});

describe('実座席座標との統合（前列中央が無条件で最適にならない）', () => {
  const screen = {
    width: 15,
    height: 7.13,
    center_x: 0,
    center_y: 4.8,
    center_z: 12.5,
  };

  const front = calcFieldOfViewMetrics(
    { position_x: 0, position_y: 0.4, position_z: 8 }, // dz=4.5（最前列中央）
    screen,
  );
  const back = calcFieldOfViewMetrics(
    { position_x: 0, position_y: 3, position_z: -2.5 }, // dz=15（中後方中央）
    screen,
  );

  it('最前列中央は「最適」にならない', () => {
    expect(getRecommendation(front)).not.toBe('excellent');
  });

  it('中後方中央は最前列中央よりスコアが高い', () => {
    expect(calcSeatScore(back)).toBeGreaterThan(calcSeatScore(front));
  });

  it('中後方中央は最適または良好', () => {
    expect(['excellent', 'good']).toContain(getRecommendation(back));
  });
});
