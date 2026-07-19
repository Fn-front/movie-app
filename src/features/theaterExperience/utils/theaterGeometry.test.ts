/**
 * theaterGeometry テスト
 */

import {
  OVERVIEW_MAX_ZOOM,
  calcOverviewZoom,
  interpolateFloorHeight,
} from './theaterGeometry';

describe('calcOverviewZoom', () => {
  it('中規模ルームは上限ズーム(28)にクランプされる', () => {
    // standard: 14.5×21×8.5 → fitSize≈25.1 → 700/25.1≈27.9, ただし上限28
    expect(calcOverviewZoom(14.5, 21, 8.5)).toBeLessThanOrEqual(
      OVERVIEW_MAX_ZOOM,
    );
    expect(calcOverviewZoom(14.5, 21, 8.5)).toBeGreaterThan(27);
  });

  it('大型ルーム(IMAX)は上限より小さくズームアウトする', () => {
    // imax: 29×26×21 → fitSize≈38.9 → 700/38.9≈18
    const imax = calcOverviewZoom(29, 26, 21);
    expect(imax).toBeLessThan(OVERVIEW_MAX_ZOOM);
    expect(imax).toBeCloseTo(18, 0);
  });

  it('部屋が大きいほどズームは小さくなる（単調）', () => {
    const std = calcOverviewZoom(14.5, 21, 8.5);
    const tcx = calcOverviewZoom(22, 25, 11);
    const imax = calcOverviewZoom(29, 26, 21);
    expect(std).toBeGreaterThan(tcx);
    expect(tcx).toBeGreaterThan(imax);
  });

  it('不正な寸法(0以下)でも上限を返す', () => {
    expect(calcOverviewZoom(0, 0, 0)).toBe(OVERVIEW_MAX_ZOOM);
  });
});

describe('interpolateFloorHeight', () => {
  // 前(z=5,y=0) → 後(z=-5,y=2) の2列
  const rowZs = [5, 0, -5];
  const rowYs = [0, 0.5, 2];

  it('各列の実Zでは、その列の実Yを返す（座席が床に接地）', () => {
    expect(interpolateFloorHeight(5, rowZs, rowYs)).toBeCloseTo(0);
    expect(interpolateFloorHeight(0, rowZs, rowYs)).toBeCloseTo(0.5);
    expect(interpolateFloorHeight(-5, rowZs, rowYs)).toBeCloseTo(2);
  });

  it('列間は線形補間される', () => {
    // z=2.5 は z=5(y=0) と z=0(y=0.5) の中点 → 0.25
    expect(interpolateFloorHeight(2.5, rowZs, rowYs)).toBeCloseTo(0.25);
    // z=-2.5 は z=0(y=0.5) と z=-5(y=2) の中点 → 1.25
    expect(interpolateFloorHeight(-2.5, rowZs, rowYs)).toBeCloseTo(1.25);
  });

  it('範囲外は端の高さにクランプされる', () => {
    expect(interpolateFloorHeight(10, rowZs, rowYs)).toBeCloseTo(0);
    expect(interpolateFloorHeight(-10, rowZs, rowYs)).toBeCloseTo(2);
  });

  it('空配列では0を返す', () => {
    expect(interpolateFloorHeight(0, [], [])).toBe(0);
  });

  it('横通路(大きなZ間隔)もランプとして補間する', () => {
    // z=0(y=0.5) と z=-5(y=2) の間に大きな間隔があってもランプになる（不連続でない）
    const mid = interpolateFloorHeight(-2.5, rowZs, rowYs);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(2);
  });
});
