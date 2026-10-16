/**
 * screenCurve テスト
 */

import {
  calcScreenArcPoint,
  calcScreenSagitta,
  isCurvedScreen,
} from './screenCurve';

describe('isCurvedScreen', () => {
  it('正の半径なら湾曲とみなす', () => {
    expect(isCurvedScreen(40)).toBe(true);
  });

  it('0 は平面とみなす', () => {
    expect(isCurvedScreen(0)).toBe(false);
  });

  it('負・NaN・Infinity は平面として扱う（不正データで破綻しない）', () => {
    expect(isCurvedScreen(-10)).toBe(false);
    expect(isCurvedScreen(NaN)).toBe(false);
    expect(isCurvedScreen(Infinity)).toBe(false);
  });
});

describe('calcScreenArcPoint', () => {
  it('平面（半径0）では既存の平面計算と完全に一致する', () => {
    expect(calcScreenArcPoint(5, 0, 13, 0)).toEqual({ x: 5, z: 13 });
    expect(calcScreenArcPoint(-5, 2, 13, 0)).toEqual({ x: -3, z: 13 });
  });

  it('幕中央（オフセット0）は湾曲していても中心のまま', () => {
    expect(calcScreenArcPoint(0, 0, 13, 40)).toEqual({ x: 0, z: 13 });
  });

  it('湾曲時は両端が客席側（z が小さい方）へ寄る', () => {
    const edge = calcScreenArcPoint(12.9, 0, 13, 40);
    expect(edge.z).toBeLessThan(13);
  });

  it('左右対称な位置は x が符号反転・z が同じになる', () => {
    const right = calcScreenArcPoint(12.9, 0, 13, 40);
    const left = calcScreenArcPoint(-12.9, 0, 13, 40);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.z).toBeCloseTo(right.z);
  });

  it('湾曲すると x は弧長より内側に寄る（弦は弧より短い）', () => {
    const p = calcScreenArcPoint(12.9, 0, 13, 40);
    expect(Math.abs(p.x)).toBeLessThan(12.9);
  });

  it('半径が大きいほど平面に近づく', () => {
    const tight = calcScreenArcPoint(12.9, 0, 13, 40);
    const loose = calcScreenArcPoint(12.9, 0, 13, 400);
    expect(13 - loose.z).toBeLessThan(13 - tight.z);
  });

  it('幕中心のオフセットが反映される', () => {
    const p = calcScreenArcPoint(0, 3, 13, 40);
    expect(p.x).toBe(3);
  });

  it('オフセットが NaN でも中心を返す（NaN を描画層へ流さない）', () => {
    expect(calcScreenArcPoint(NaN, 1, 13, 40)).toEqual({ x: 1, z: 13 });
    expect(calcScreenArcPoint(NaN, 1, 13, 0)).toEqual({ x: 1, z: 13 });
  });
});

describe('calcScreenSagitta', () => {
  it('平面なら 0', () => {
    expect(calcScreenSagitta(25.8, 0)).toBe(0);
  });

  it('IMAX の実データで約2.06mになる', () => {
    // 幅 25.8m（弧長）/ R 40m → θ=0.3225rad, 40*(1-cos θ) ≈ 2.06m
    expect(calcScreenSagitta(25.8, 40)).toBeCloseTo(2.06, 2);
  });

  it('calcScreenArcPoint の端点のせり出しと一致する', () => {
    const width = 25.8;
    const radius = 40;
    const edge = calcScreenArcPoint(width / 2, 0, 13, radius);
    expect(13 - edge.z).toBeCloseTo(calcScreenSagitta(width, radius));
  });

  it('半径が大きいほどせり出しが小さい', () => {
    expect(calcScreenSagitta(25.8, 400)).toBeLessThan(
      calcScreenSagitta(25.8, 40),
    );
  });

  it('幅が0以下・NaN なら 0', () => {
    expect(calcScreenSagitta(0, 40)).toBe(0);
    expect(calcScreenSagitta(-5, 40)).toBe(0);
    expect(calcScreenSagitta(NaN, 40)).toBe(0);
  });

  it('IMAX のせり出しが最前列との間隔に収まる', () => {
    // スクリーン z=13 / 最前列 z=7.0 → 間隔 6m
    expect(calcScreenSagitta(25.8, 40)).toBeLessThan(6);
  });
});
