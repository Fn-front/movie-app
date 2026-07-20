/**
 * theaterGeometry テスト
 */

import {
  OVERVIEW_MAX_ZOOM,
  calcOverviewZoom,
  computeSeatXSegments,
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

describe('computeSeatXSegments', () => {
  it('縦通路が無ければ1ブロックにまとまる（端席の外側へ張り出す）', () => {
    // 等間隔4席 -1,0,1,2 → 1ブロック。幅 = (2 - -1) + 0.3*2 = 3.6、中心 0.5
    const segs = computeSeatXSegments([-1, 0, 1, 2]);
    expect(segs).toHaveLength(1);
    expect(segs[0].center).toBeCloseTo(0.5);
    expect(segs[0].width).toBeCloseTo(3.6);
  });

  it('通常間隔を大きく超えるギャップ（縦通路）でブロックが分割される', () => {
    // 間隔1の座席群を、中央の幅3のギャップで2ブロックに分割
    // 左: -3,-2,-1 / 右: 2,3,4
    const segs = computeSeatXSegments([-3, -2, -1, 2, 3, 4]);
    expect(segs).toHaveLength(2);
    expect(segs[0].center).toBeCloseTo(-2); // (-3 + -1)/2
    expect(segs[0].width).toBeCloseTo(2 + 0.6); // (-1 - -3) + 0.6
    expect(segs[1].center).toBeCloseTo(3); // (2 + 4)/2
    expect(segs[1].width).toBeCloseTo(2 + 0.6);
  });

  it('縦通路2本で3ブロックに分割される', () => {
    // -4,-3 | (通路) | 0,1 | (通路) | 4,5
    const segs = computeSeatXSegments([-4, -3, 0, 1, 4, 5]);
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.center)).toEqual([-3.5, 0.5, 4.5]);
  });

  it('重複xは1つに畳まれ、順不同でも正しく分割される', () => {
    const segs = computeSeatXSegments([1, -1, 0, 1, -1, 5, 6]);
    // ユニーク昇順: -1,0,1,5,6 → 通常間隔1、5でギャップ4(=通路) → 2ブロック
    expect(segs).toHaveLength(2);
    expect(segs[0].center).toBeCloseTo(0); // (-1 + 1)/2
    expect(segs[1].center).toBeCloseTo(5.5); // (5 + 6)/2
  });

  it('席が1つなら中心その席・幅は張り出し分のみ', () => {
    const segs = computeSeatXSegments([2]);
    expect(segs).toEqual([{ center: 2, width: 0.6 }]);
  });

  it('空配列では空セグメント', () => {
    expect(computeSeatXSegments([])).toEqual([]);
  });

  it('張り出し・通路閾値はパラメータで調整できる', () => {
    // aisleGapRatio を上げると同じ間隔でも通路とみなされずまとまる
    const merged = computeSeatXSegments([0, 1, 3, 4], 0.3, 3);
    expect(merged).toHaveLength(1);
    // 既定閾値(1.5)ではギャップ2 > 1*1.5 で分割される
    const split = computeSeatXSegments([0, 1, 3, 4]);
    expect(split).toHaveLength(2);
  });
});
