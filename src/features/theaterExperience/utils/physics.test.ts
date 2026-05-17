/**
 * 音響物理計算ユーティリティ テスト
 */

import {
  calcDistance,
  calcDistanceAttenuation,
  calcAtmosphericAbsorption,
  calcDirectivity,
  calcSpeakerContribution,
  calcTotalIntensity,
  ABSORPTION_COEFFICIENTS,
  SPEED_OF_SOUND,
  FREQUENCY_MAP,
  MIN_DISTANCE,
} from './physics';

describe('calcDistance', () => {
  it('同一点の距離は0', () => {
    expect(calcDistance(0, 0, 0, 0, 0, 0)).toBe(0);
  });

  it('X軸方向の距離を正しく計算する', () => {
    expect(calcDistance(3, 0, 0, 0, 0, 0)).toBe(3);
  });

  it('3D距離を正しく計算する', () => {
    // 3-4-5三角形の3D版: √(1² + 2² + 2²) = 3
    expect(calcDistance(1, 2, 2, 0, 0, 0)).toBe(3);
  });
});

describe('calcDistanceAttenuation', () => {
  it('距離1mでの逆二乗則を正しく計算する', () => {
    const power = 500;
    const expected = power / (4 * Math.PI * 1 * 1);
    expect(calcDistanceAttenuation(power, 1)).toBeCloseTo(expected);
  });

  it('距離2mでは距離1mの1/4になる', () => {
    const power = 500;
    const at1m = calcDistanceAttenuation(power, 1);
    const at2m = calcDistanceAttenuation(power, 2);
    expect(at2m).toBeCloseTo(at1m / 4);
  });

  it('距離がMIN_DISTANCE未満の場合はMIN_DISTANCEにクランプする', () => {
    const clamped = calcDistanceAttenuation(500, 0);
    const atMin = calcDistanceAttenuation(500, MIN_DISTANCE);
    expect(clamped).toBeCloseTo(atMin);
    expect(calcDistanceAttenuation(500, -1)).toBeCloseTo(atMin);
  });

  it('出力に比例する', () => {
    const at500 = calcDistanceAttenuation(500, 5);
    const at1000 = calcDistanceAttenuation(1000, 5);
    expect(at1000).toBeCloseTo(at500 * 2);
  });
});

describe('calcAtmosphericAbsorption', () => {
  it('距離0では減衰なし（1.0）', () => {
    expect(calcAtmosphericAbsorption('low', 0)).toBe(1);
    expect(calcAtmosphericAbsorption('mid', 0)).toBe(1);
    expect(calcAtmosphericAbsorption('high', 0)).toBe(1);
  });

  it('低音は減衰が最も小さい', () => {
    const distance = 10;
    const low = calcAtmosphericAbsorption('low', distance);
    const mid = calcAtmosphericAbsorption('mid', distance);
    const high = calcAtmosphericAbsorption('high', distance);
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
  });

  it('距離10mでの低音減衰を正しく計算する', () => {
    const expected = Math.exp(-ABSORPTION_COEFFICIENTS.low * 10);
    expect(calcAtmosphericAbsorption('low', 10)).toBeCloseTo(expected);
  });

  it('距離10mでの高音減衰を正しく計算する', () => {
    // high = 0.009, exp(-0.009 * 10) = exp(-0.09) ≈ 0.914
    const expected = Math.exp(-ABSORPTION_COEFFICIENTS.high * 10);
    expect(calcAtmosphericAbsorption('high', 10)).toBeCloseTo(expected);
  });
});

describe('calcDirectivity', () => {
  it('alpha=1.0 のとき全方向均等で1.0を返す', () => {
    expect(calcDirectivity(0, 0, -1, 1, 0, 0, 1.0)).toBe(1.0);
    expect(calcDirectivity(0, 0, -1, -1, 0, 0, 1.0)).toBe(1.0);
  });

  it('正面方向では最大値を返す（alpha=0.5, cosθ=1）', () => {
    // 方向: (0, 0, -1), リスナー方向: (0, 0, -1) → cosθ=1
    const result = calcDirectivity(0, 0, -1, 0, 0, -1, 0.5);
    // D = 0.5 + 0.5 * 1.0 = 1.0
    expect(result).toBeCloseTo(1.0);
  });

  it('背面方向では最小値を返す（alpha=0.5, cosθ<0）', () => {
    // 方向: (0, 0, -1), リスナー方向: (0, 0, 1) → cosθ=-1
    const result = calcDirectivity(0, 0, -1, 0, 0, 1, 0.5);
    // D = 0.5 + 0.5 * max(-1, 0) = 0.5
    expect(result).toBeCloseTo(0.5);
  });

  it('真横方向ではalpha値を返す（alpha=0.5, cosθ=0）', () => {
    // 方向: (0, 0, -1), リスナー方向: (1, 0, 0) → cosθ=0
    const result = calcDirectivity(0, 0, -1, 1, 0, 0, 0.5);
    // D = 0.5 + 0.5 * max(0, 0) = 0.5
    expect(result).toBeCloseTo(0.5);
  });

  it('天井スピーカーの広めパターン（alpha=0.6）', () => {
    // 正面
    const front = calcDirectivity(0, -1, 0, 0, -1, 0, 0.6);
    expect(front).toBeCloseTo(1.0);
    // 背面
    const back = calcDirectivity(0, -1, 0, 0, 1, 0, 0.6);
    expect(back).toBeCloseTo(0.6);
  });

  it('ゼロベクトルではalpha値を返す', () => {
    expect(calcDirectivity(0, 0, 0, 0, 0, -1, 0.5)).toBe(0.5);
    expect(calcDirectivity(0, 0, -1, 0, 0, 0, 0.5)).toBe(0.5);
  });
});

describe('calcSpeakerContribution', () => {
  it('距離0以下では0を返す', () => {
    expect(calcSpeakerContribution(500, 0, 'mid', 0)).toBe(0);
  });

  it('時刻0、距離1m、位相0での値を計算する', () => {
    const result = calcSpeakerContribution(500, 1, 'mid', 0, 0);
    // √(500/(4π)) * exp(-0.001) * cos(-2π*1000/343)
    expect(typeof result).toBe('number');
    expect(isFinite(result)).toBe(true);
  });

  it('cosの性質で値が-1〜1の範囲でスケールされる', () => {
    // 十分遠い距離で値が小さくなることを確認
    const near = Math.abs(calcSpeakerContribution(500, 1, 'mid', 0));
    const far = Math.abs(calcSpeakerContribution(500, 10, 'mid', 0));
    expect(near).toBeGreaterThan(far);
  });

  it('directivity=0.5 のとき寄与が半分になる', () => {
    const full = calcSpeakerContribution(500, 5, 'mid', 0, 0, 1.0);
    const half = calcSpeakerContribution(500, 5, 'mid', 0, 0, 0.5);
    expect(half).toBeCloseTo(full * 0.5);
  });

  it('directivity未指定ではデフォルト1.0', () => {
    const withDefault = calcSpeakerContribution(500, 5, 'mid', 0, 0);
    const withExplicit = calcSpeakerContribution(500, 5, 'mid', 0, 0, 1.0);
    expect(withDefault).toBeCloseTo(withExplicit);
  });
});

describe('calcTotalIntensity', () => {
  const singleSpeaker = [
    { position_x: 0, position_y: 4, position_z: 12, power_watts: 500 },
  ];

  it('スピーカー1本での強度を正しく計算する', () => {
    const point = { x: 0, y: 0, z: 0 };
    const result = calcTotalIntensity(singleSpeaker, point, 'mid', 0);
    const distance = calcDistance(0, 4, 12, 0, 0, 0); // √(16+144) = √160
    const expected = calcSpeakerContribution(500, distance, 'mid', 0);
    expect(result).toBeCloseTo(expected);
  });

  it('対称配置のスピーカー2本は中央点で強め合う場合がある', () => {
    const symmetricSpeakers = [
      { position_x: -6, position_y: 4, position_z: 12, power_watts: 500 },
      { position_x: 6, position_y: 4, position_z: 12, power_watts: 500 },
    ];
    const centerPoint = { x: 0, y: 0, z: 0 };
    const result = calcTotalIntensity(symmetricSpeakers, centerPoint, 'mid', 0);
    // 対称なので各寄与は同じ → 合計は2倍
    const singleContrib = calcSpeakerContribution(
      500,
      calcDistance(-6, 4, 12, 0, 0, 0),
      'mid',
      0,
    );
    expect(result).toBeCloseTo(singleContrib * 2);
  });

  it('スピーカーが空の場合は0を返す', () => {
    expect(calcTotalIntensity([], { x: 0, y: 0, z: 0 }, 'mid', 0)).toBe(0);
  });
});

describe('定数', () => {
  it('SPEED_OF_SOUND は 343 m/s', () => {
    expect(SPEED_OF_SOUND).toBe(343);
  });

  it('FREQUENCY_MAP が正しい周波数を持つ', () => {
    expect(FREQUENCY_MAP.low).toBe(80);
    expect(FREQUENCY_MAP.mid).toBe(1000);
    expect(FREQUENCY_MAP.high).toBe(8000);
  });

  it('ABSORPTION_COEFFICIENTS が low < mid < high の順', () => {
    expect(ABSORPTION_COEFFICIENTS.low).toBeLessThan(
      ABSORPTION_COEFFICIENTS.mid,
    );
    expect(ABSORPTION_COEFFICIENTS.mid).toBeLessThan(
      ABSORPTION_COEFFICIENTS.high,
    );
  });
});
