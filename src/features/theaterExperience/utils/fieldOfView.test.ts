/**
 * 視野・歪み計算ユーティリティ テスト
 */

import {
  calcHorizontalFov,
  calcVerticalFov,
  calcFovRatios,
  calcDistortionScore,
  calcDistanceToScreen,
  calcFieldOfViewMetrics,
  projectScreenQuad,
} from './fieldOfView';

describe('calcHorizontalFov', () => {
  it('距離0以下では0を返す', () => {
    expect(calcHorizontalFov(14, 0)).toBe(0);
    expect(calcHorizontalFov(14, -1)).toBe(0);
  });

  it('スクリーン幅14m、距離7.5mでの視野角を正しく計算する', () => {
    const expected = 2 * Math.atan(7 / 7.5);
    expect(calcHorizontalFov(14, 7.5)).toBeCloseTo(expected);
  });

  it('距離が大きくなると視野角が小さくなる', () => {
    const near = calcHorizontalFov(14, 5);
    const far = calcHorizontalFov(14, 20);
    expect(near).toBeGreaterThan(far);
  });
});

describe('calcVerticalFov', () => {
  it('距離0以下では0を返す', () => {
    expect(calcVerticalFov(6, 0)).toBe(0);
  });

  it('スクリーン高6m、距離7.5mでの視野角を正しく計算する', () => {
    const expected = 2 * Math.atan(3 / 7.5);
    expect(calcVerticalFov(6, 7.5)).toBeCloseTo(expected);
  });
});

describe('calcFovRatios', () => {
  it('視野占有率を0〜1の範囲で返す', () => {
    const { horizontal_ratio, vertical_ratio } = calcFovRatios(14, 6, 7.5);
    expect(horizontal_ratio).toBeGreaterThan(0);
    expect(horizontal_ratio).toBeLessThan(1);
    expect(vertical_ratio).toBeGreaterThan(0);
    expect(vertical_ratio).toBeLessThan(1);
  });

  it('水平占有率は垂直占有率より大きい（スクリーンが横長の場合）', () => {
    const { horizontal_ratio, vertical_ratio } = calcFovRatios(14, 6, 7.5);
    expect(horizontal_ratio).toBeGreaterThan(vertical_ratio);
  });

  it('前方席（距離小）は後方席（距離大）より占有率が大きい', () => {
    const front = calcFovRatios(14, 6, 5);
    const back = calcFovRatios(14, 6, 15);
    expect(front.horizontal_ratio).toBeGreaterThan(back.horizontal_ratio);
  });
});

describe('calcDistortionScore', () => {
  it('中央席の歪みは0', () => {
    expect(calcDistortionScore(0, 0, 14)).toBe(0);
  });

  it('スクリーン端の席の歪みは1', () => {
    // スクリーン幅14m、中心0 → 端は±7m
    expect(calcDistortionScore(7, 0, 14)).toBeCloseTo(1);
    expect(calcDistortionScore(-7, 0, 14)).toBeCloseTo(1);
  });

  it('中間位置の歪みは0〜1の間', () => {
    const score = calcDistortionScore(3.5, 0, 14);
    expect(score).toBeCloseTo(0.5);
  });

  it('スクリーン幅外の席の歪みは1でクランプされる', () => {
    expect(calcDistortionScore(10, 0, 14)).toBe(1);
  });

  it('スクリーン幅0以下では0を返す', () => {
    expect(calcDistortionScore(5, 0, 0)).toBe(0);
  });
});

describe('calcDistanceToScreen', () => {
  it('Z方向の距離を正しく計算する', () => {
    // 座席Z=5, スクリーンZ=12.5 → 距離7.5
    expect(calcDistanceToScreen(5, 12.5)).toBeCloseTo(7.5);
  });

  it('座席がスクリーンの前後どちらでも正の値', () => {
    expect(calcDistanceToScreen(-7, 12.5)).toBeCloseTo(19.5);
  });
});

describe('calcFieldOfViewMetrics', () => {
  const screen = { width: 14, height: 6, center_x: 0, center_z: 12.5 };

  it('中央前方席のメトリクスを正しく計算する', () => {
    const seat = { position_x: 0, position_z: 5 };
    const metrics = calcFieldOfViewMetrics(seat, screen);

    expect(metrics.distance_to_screen).toBeCloseTo(7.5);
    expect(metrics.distortion_score).toBeCloseTo(0);
    expect(metrics.horizontal_ratio).toBeGreaterThan(0.3);
    expect(metrics.vertical_ratio).toBeGreaterThan(0);
  });

  it('端席は歪みスコアが高い', () => {
    const center = calcFieldOfViewMetrics(
      { position_x: 0, position_z: 5 },
      screen,
    );
    const edge = calcFieldOfViewMetrics(
      { position_x: 7, position_z: 5 },
      screen,
    );

    expect(edge.distortion_score).toBeGreaterThan(center.distortion_score);
  });

  it('後方席は占有率が低い', () => {
    const front = calcFieldOfViewMetrics(
      { position_x: 0, position_z: 5 },
      screen,
    );
    const back = calcFieldOfViewMetrics(
      { position_x: 0, position_z: -7 },
      screen,
    );

    expect(front.horizontal_ratio).toBeGreaterThan(back.horizontal_ratio);
  });
});

describe('projectScreenQuad', () => {
  const screen = {
    width: 14,
    height: 6,
    center_x: 0,
    center_y: 4,
    center_z: 12.5,
  };

  it('中央席からの投影は左右対称になる', () => {
    const seat = { x: 0, y: 1, z: 0 };
    const [tl, tr, br, bl] = projectScreenQuad(seat, screen);

    // 左上と右上のX座標は符号反転で対称
    expect(tl.x).toBeCloseTo(-tr.x);
    // 左下と右下も同様
    expect(bl.x).toBeCloseTo(-br.x);
    // Y座標は左右で同じ
    expect(tl.y).toBeCloseTo(tr.y);
    expect(bl.y).toBeCloseTo(br.y);
  });

  it('端席からの投影は左右非対称（台形）になる', () => {
    const seat = { x: 5, y: 1, z: 0 };
    const [tl, tr] = projectScreenQuad(seat, screen);

    // 右端に座っているので、左上の角度差は右上より大きい
    expect(Math.abs(tl.x)).toBeGreaterThan(Math.abs(tr.x));
  });

  it('スクリーンが座席の後ろにある場合はゼロ座標を返す', () => {
    const seat = { x: 0, y: 1, z: 15 }; // スクリーン(z=12.5)の前
    const quad = projectScreenQuad(seat, screen);
    quad.forEach((p) => {
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
    });
  });

  it('4頂点を返す', () => {
    const seat = { x: 0, y: 1, z: 0 };
    const quad = projectScreenQuad(seat, screen);
    expect(quad).toHaveLength(4);
    quad.forEach((p) => {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
    });
  });
});
