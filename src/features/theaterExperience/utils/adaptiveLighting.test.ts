/**
 * adaptiveLighting テスト
 */

import {
  FIRST_PERSON_INTENSITIES,
  OVERVIEW_INTENSITIES,
  calcLightIntensities,
  getTargetIntensities,
  lerpIntensities,
} from './adaptiveLighting';

describe('OVERVIEW_INTENSITIES', () => {
  it('俯瞰の強度は既存値から変えない（座席選択UIとE2Eスクショを守る）', () => {
    // 変更するとスタジアム客席の識別性とE2Eスクリーンショットに影響するため、
    // 値そのものをテストで固定する
    expect(OVERVIEW_INTENSITIES).toEqual({
      ambient: 0.5,
      hemisphere: 0.35,
      directional: 1.15,
      screen: 0,
    });
  });

  it('俯瞰ではスクリーン面光源を使わない', () => {
    // 面光源は一人称専用。俯瞰で点けると座席選択UIの見え方が変わるため
    expect(OVERVIEW_INTENSITIES.screen).toBe(0);
  });
});

describe('getTargetIntensities', () => {
  it('俯瞰では俯瞰用の強度を返す', () => {
    expect(getTargetIntensities(false)).toBe(OVERVIEW_INTENSITIES);
  });

  it('一人称では一人称用の強度を返す', () => {
    expect(getTargetIntensities(true)).toBe(FIRST_PERSON_INTENSITIES);
  });

  it('一人称は環境光系が俯瞰より暗い（劇場らしい暗さになる）', () => {
    const over = getTargetIntensities(false);
    const fpv = getTargetIntensities(true);
    expect(fpv.ambient).toBeLessThan(over.ambient);
    expect(fpv.hemisphere).toBeLessThan(over.hemisphere);
    expect(fpv.directional).toBeLessThan(over.directional);
  });

  it('一人称ではスクリーンが主光源になる', () => {
    const fpv = getTargetIntensities(true);
    // 実機の客席は幕に面した側だけが照らされる。環境光より面光源が強いことで
    // 方向性のある照明になる（一様に暗いだけの絵にしない）
    expect(fpv.screen).toBeGreaterThan(fpv.ambient);
    expect(fpv.screen).toBeGreaterThan(fpv.directional);
  });

  it('一人称でも完全な暗黒にはしない（形が全く見えなくなるのを防ぐ）', () => {
    const fpv = getTargetIntensities(true);
    expect(fpv.ambient).toBeGreaterThan(0);
    expect(fpv.hemisphere).toBeGreaterThan(0);
    expect(fpv.directional).toBeGreaterThan(0);
  });
});

describe('lerpIntensities', () => {
  const from = { ambient: 0, hemisphere: 0, directional: 0, screen: 0 };
  const to = { ambient: 1, hemisphere: 2, directional: 4, screen: 8 };

  it('t=0 では開始値、t=1 では目標値になる', () => {
    expect(lerpIntensities(from, to, 0)).toEqual(from);
    expect(lerpIntensities(from, to, 1)).toEqual(to);
  });

  it('t=0.5 では中間値になる', () => {
    expect(lerpIntensities(from, to, 0.5)).toEqual({
      ambient: 0.5,
      hemisphere: 1,
      directional: 2,
      screen: 4,
    });
  });

  it('範囲外の t はクランプする', () => {
    expect(lerpIntensities(from, to, -1)).toEqual(from);
    expect(lerpIntensities(from, to, 2)).toEqual(to);
  });
});

describe('calcLightIntensities', () => {
  const from = OVERVIEW_INTENSITIES;
  const to = FIRST_PERSON_INTENSITIES;
  const duration = 0.55;

  it('経過0では開始値のままになる', () => {
    expect(calcLightIntensities(from, to, 0, duration)).toEqual(from);
  });

  it('経過が遷移時間に達したら目標値になる', () => {
    const result = calcLightIntensities(from, to, duration, duration);
    expect(result.ambient).toBeCloseTo(to.ambient);
    expect(result.hemisphere).toBeCloseTo(to.hemisphere);
    expect(result.directional).toBeCloseTo(to.directional);
  });

  it('遷移時間を超えても目標値で静止する（冪等）', () => {
    expect(calcLightIntensities(from, to, duration * 3, duration)).toEqual(
      calcLightIntensities(from, to, duration, duration),
    );
  });

  it('ease-out のため前半の変化量が後半より大きい', () => {
    const quarter = calcLightIntensities(from, to, duration * 0.25, duration);
    const half = calcLightIntensities(from, to, duration * 0.5, duration);
    const firstHalfDelta = from.ambient - quarter.ambient;
    const secondHalfDelta = quarter.ambient - half.ambient;
    expect(firstHalfDelta).toBeGreaterThan(secondHalfDelta);
  });

  it('遷移時間0なら即時に目標値を返す（prefers-reduced-motion 時）', () => {
    expect(calcLightIntensities(from, to, 0, 0)).toBe(to);
  });

  it('遷移時間が負でも即時に目標値を返す', () => {
    expect(calcLightIntensities(from, to, 0, -1)).toBe(to);
  });

  it('補間中は常に開始値と目標値の間に収まる', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const r = calcLightIntensities(from, to, duration * t, duration);
      expect(r.ambient).toBeLessThanOrEqual(from.ambient);
      expect(r.ambient).toBeGreaterThanOrEqual(to.ambient);
      expect(r.directional).toBeLessThanOrEqual(from.directional);
      expect(r.directional).toBeGreaterThanOrEqual(to.directional);
    }
  });
});
