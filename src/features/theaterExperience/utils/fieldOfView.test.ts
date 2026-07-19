/**
 * 視野・歪み計算ユーティリティ テスト
 */

import {
  calcDistance3D,
  calcViewingFovRatios,
  calcViewingDistortion,
  calcDistanceToScreen,
  calcFieldOfViewMetrics,
  projectScreenQuad,
  calcYawClampedTargetX,
} from './fieldOfView';

describe('calcDistance3D', () => {
  it('X/Y/Zすべてを含む3Dユークリッド距離を返す', () => {
    // dx=0, dy=-3, dz=-7.5 → sqrt(0+9+56.25)
    const d = calcDistance3D({ x: 0, y: 1, z: 5 }, { x: 0, y: 4, z: 12.5 });
    expect(d).toBeCloseTo(Math.sqrt(65.25));
  });

  it('同一列でも左右にずれるほど距離が大きくなる', () => {
    const center = calcDistance3D(
      { x: 0, y: 1, z: 5 },
      { x: 0, y: 4, z: 12.5 },
    );
    const edge = calcDistance3D({ x: 7, y: 1, z: 5 }, { x: 0, y: 4, z: 12.5 });
    expect(edge).toBeGreaterThan(center);
  });
});

describe('calcDistanceToScreen', () => {
  it('Z方向の距離を正しく計算する', () => {
    expect(calcDistanceToScreen(5, 12.5)).toBeCloseTo(7.5);
  });

  it('座席がスクリーンの前後どちらでも正の値', () => {
    expect(calcDistanceToScreen(-7, 12.5)).toBeCloseTo(19.5);
  });
});

describe('calcViewingFovRatios', () => {
  const screen = {
    width: 14,
    height: 6,
    center_x: 0,
    center_y: 4,
    center_z: 12.5,
  };

  it('視野占有率を0〜1の範囲で返す', () => {
    const { horizontal_ratio, vertical_ratio } = calcViewingFovRatios(
      { x: 0, y: 1, z: 5 },
      screen,
    );
    expect(horizontal_ratio).toBeGreaterThan(0);
    expect(horizontal_ratio).toBeLessThan(1);
    expect(vertical_ratio).toBeGreaterThan(0);
    expect(vertical_ratio).toBeLessThan(1);
  });

  it('横長スクリーンでは水平占有率が垂直占有率より大きい', () => {
    const { horizontal_ratio, vertical_ratio } = calcViewingFovRatios(
      { x: 0, y: 1, z: 5 },
      screen,
    );
    expect(horizontal_ratio).toBeGreaterThan(vertical_ratio);
  });

  it('前方席（距離小）は後方席（距離大）より水平占有率が大きい', () => {
    const front = calcViewingFovRatios({ x: 0, y: 1, z: 5 }, screen);
    const back = calcViewingFovRatios({ x: 0, y: 1, z: -7 }, screen);
    expect(front.horizontal_ratio).toBeGreaterThan(back.horizontal_ratio);
  });

  it('同一列では端席の方が水平占有率が小さい（斜めから見るため）', () => {
    const center = calcViewingFovRatios({ x: 0, y: 1, z: 5 }, screen);
    const edge = calcViewingFovRatios({ x: 7, y: 1, z: 5 }, screen);
    expect(edge.horizontal_ratio).toBeLessThan(center.horizontal_ratio);
  });

  it('スクリーンが座席の後ろ（dz<=0）なら0を返す', () => {
    const ratios = calcViewingFovRatios({ x: 0, y: 1, z: 12.5 }, screen);
    expect(ratios.horizontal_ratio).toBe(0);
    expect(ratios.vertical_ratio).toBe(0);
  });
});

describe('calcViewingDistortion', () => {
  const center = { x: 0, y: 4, z: 12.5 };

  it('中央付近の席は歪みが小さい', () => {
    const d = calcViewingDistortion({ x: 0, y: 1, z: 5 }, center);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(0.3);
  });

  it('端席は歪みが大きい（水平の斜め角）', () => {
    const c = calcViewingDistortion({ x: 0, y: 1, z: 5 }, center);
    const edge = calcViewingDistortion({ x: 7, y: 1, z: 5 }, center);
    expect(edge).toBeGreaterThan(c);
  });

  it('前列は歪みが大きい（見上げ角=距離依存keystone）', () => {
    const front = calcViewingDistortion({ x: 0, y: 1, z: 5 }, center);
    const back = calcViewingDistortion({ x: 0, y: 1, z: -7 }, center);
    expect(front).toBeGreaterThan(back);
  });

  it('0〜1にクランプされる', () => {
    const d = calcViewingDistortion({ x: 20, y: 0, z: 12 }, center);
    expect(d).toBeLessThanOrEqual(1);
    expect(d).toBeGreaterThanOrEqual(0);
  });

  it('スクリーンが座席の後ろ（dz<=0）なら0を返す', () => {
    expect(calcViewingDistortion({ x: 0, y: 1, z: 13 }, center)).toBe(0);
  });
});

describe('calcFieldOfViewMetrics', () => {
  const screen = {
    width: 14,
    height: 6,
    center_x: 0,
    center_y: 4,
    center_z: 12.5,
  };

  it('中央前方席のメトリクスを正しく計算する', () => {
    const seat = { position_x: 0, position_y: 1, position_z: 5 };
    const metrics = calcFieldOfViewMetrics(seat, screen);

    // 距離は3D（dz=7.5, dy=-3）
    expect(metrics.distance_to_screen).toBeCloseTo(Math.sqrt(65.25));
    expect(metrics.horizontal_ratio).toBeGreaterThan(0.3);
    expect(metrics.vertical_ratio).toBeGreaterThan(0);
    expect(metrics.distortion_score).toBeLessThan(0.3);
  });

  it('同一列でも中央席と端席で距離・占有率・歪みに差が出る（本Issueの核心）', () => {
    const center = calcFieldOfViewMetrics(
      { position_x: 0, position_y: 1, position_z: 5 },
      screen,
    );
    const edge = calcFieldOfViewMetrics(
      { position_x: 7, position_y: 1, position_z: 5 },
      screen,
    );

    expect(edge.distance_to_screen).toBeGreaterThan(center.distance_to_screen);
    expect(edge.horizontal_ratio).toBeLessThan(center.horizontal_ratio);
    expect(edge.distortion_score).toBeGreaterThan(center.distortion_score);
  });

  it('後方席は占有率が低く、前列は歪みが大きい', () => {
    const front = calcFieldOfViewMetrics(
      { position_x: 0, position_y: 1, position_z: 5 },
      screen,
    );
    const back = calcFieldOfViewMetrics(
      { position_x: 0, position_y: 1, position_z: -7 },
      screen,
    );

    expect(front.horizontal_ratio).toBeGreaterThan(back.horizontal_ratio);
    expect(front.distortion_score).toBeGreaterThan(back.distortion_score);
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

describe('calcYawClampedTargetX', () => {
  const MAX_YAW = (20 * Math.PI) / 180;
  const DEADZONE = (15 * Math.PI) / 180;

  it('中央席は首を振らず真正面（=座席X）を向く', () => {
    expect(calcYawClampedTargetX(0, 0, 5, MAX_YAW, DEADZONE)).toBeCloseTo(0, 6);
  });

  it('不感帯内（中央寄り）の席は首を振らず真正面を向く', () => {
    // seatX=-1: 中心方向角 = atan(1/5) ≒ 11.3° < 15°(不感帯) → 振らず座席X(-1)
    expect(calcYawClampedTargetX(-1, 0, 5, MAX_YAW, DEADZONE)).toBeCloseTo(
      -1,
      6,
    );
  });

  it('不感帯を超えた分だけ首を振る（超過角のみ）', () => {
    // 中心方向角25°の席 → 首振り = 25° - 15°(不感帯) = 10°
    const seatX = -5 * Math.tan((25 * Math.PI) / 180);
    const targetX = calcYawClampedTargetX(seatX, 0, 5, MAX_YAW, DEADZONE);
    const yaw = Math.atan(Math.abs(targetX - seatX) / 5);
    expect(yaw).toBeCloseTo((10 * Math.PI) / 180, 6);
  });

  it('端席は上限角で頭打ちになる（中心まで振り切らない）', () => {
    // A列端: seatX=-7.2, 中心方向角=55.2°。不感帯控除後40.2°>20°(上限)→20°で頭打ち
    const targetX = calcYawClampedTargetX(-7.2, 0, 5, MAX_YAW, DEADZONE);
    const yaw = Math.atan(Math.abs(targetX - -7.2) / 5);
    expect(yaw).toBeCloseTo(MAX_YAW, 6);
    expect(targetX).toBeCloseTo(-7.2 + 5 * Math.tan(MAX_YAW), 6);
  });

  it('反対側の端席でも符号を保って頭打ちになる', () => {
    const targetX = calcYawClampedTargetX(7.2, 0, 5, MAX_YAW, DEADZONE);
    expect(targetX).toBeCloseTo(7.2 - 5 * Math.tan(MAX_YAW), 6);
  });

  it('不感帯0（既定）なら上限内でスクリーン中心を向く', () => {
    // deadzone省略時は従来のクランプ動作: 11.3°<20° → 中心(0)を向く
    expect(calcYawClampedTargetX(-1, 0, 5, MAX_YAW)).toBeCloseTo(0, 6);
  });

  it('前方距離が0以下ならスクリーン中心を返す（フォールバック）', () => {
    expect(calcYawClampedTargetX(-7.2, 0, 0, MAX_YAW, DEADZONE)).toBe(0);
    expect(calcYawClampedTargetX(-7.2, 0, -3, MAX_YAW, DEADZONE)).toBe(0);
  });
});
