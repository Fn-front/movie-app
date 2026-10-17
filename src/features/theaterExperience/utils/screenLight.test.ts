/**
 * screenLight テスト
 */

import {
  computeScreenLightPlacement,
  isScreenLightVisible,
} from './screenLight';

describe('computeScreenLightPlacement', () => {
  // standard-medium 相当（幕: 幅16 / 高6.7 / 中心(0, 4.35, 12.5)）
  const standard = () => computeScreenLightPlacement(0, 4.35, 12.5, 16, 6.7);

  it('幕のサイズをそのまま発光面のサイズにする', () => {
    const p = standard();
    expect(p.width).toBe(16);
    expect(p.height).toBe(6.7);
  });

  it('幕のごく手前（客席側）に置く', () => {
    const p = standard();
    // +Z がスクリーン側なので、客席側へ出す = Z が小さくなる
    expect(p.position[2]).toBeLessThan(12.5);
    expect(p.position[2]).toBeCloseTo(12.35, 5);
  });

  it('XとYは幕の中心に一致する', () => {
    const p = standard();
    expect(p.position[0]).toBe(0);
    expect(p.position[1]).toBe(4.35);
  });

  it('客席側（-Z方向）へ向ける', () => {
    const p = standard();
    expect(p.target[2]).toBeLessThan(p.position[2]);
    // 真正面を向く（XYはずらさない）
    expect(p.target[0]).toBe(p.position[0]);
    expect(p.target[1]).toBe(p.position[1]);
  });

  it('幕が中心からずれていても追従する', () => {
    const p = computeScreenLightPlacement(3, 5, 10, 12, 5);
    expect(p.position[0]).toBe(3);
    expect(p.position[1]).toBe(5);
    expect(p.target[0]).toBe(3);
  });

  it('負の寸法は0にクランプする', () => {
    const p = computeScreenLightPlacement(0, 4, 12, -5, -2);
    expect(p.width).toBe(0);
    expect(p.height).toBe(0);
  });
});

describe('isScreenLightVisible', () => {
  it('強度があり寸法も正なら描画する', () => {
    expect(isScreenLightVisible(2.6, 16, 6.7)).toBe(true);
  });

  it('強度0なら描画しない（俯瞰の描画コストを増やさない）', () => {
    expect(isScreenLightVisible(0, 16, 6.7)).toBe(false);
  });

  it('遷移中の極小な強度でも描画しない', () => {
    expect(isScreenLightVisible(0.0005, 16, 6.7)).toBe(false);
  });

  it('負の強度は描画しない', () => {
    expect(isScreenLightVisible(-1, 16, 6.7)).toBe(false);
  });

  it('NaN は描画しない', () => {
    expect(isScreenLightVisible(Number.NaN, 16, 6.7)).toBe(false);
  });

  it('寸法が0なら描画しない', () => {
    expect(isScreenLightVisible(2.6, 0, 6.7)).toBe(false);
    expect(isScreenLightVisible(2.6, 16, 0)).toBe(false);
  });
});
