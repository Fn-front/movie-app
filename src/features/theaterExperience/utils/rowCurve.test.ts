/**
 * rowCurve テスト
 */

import {
  calcArcForwardShift,
  calcSeatYawOnArc,
  isCurvedLayout,
  rotateLocalOffset,
} from './rowCurve';

describe('isCurvedLayout', () => {
  it('正の半径なら弧状とみなす', () => {
    expect(isCurvedLayout(29)).toBe(true);
  });

  it('0 は直線列とみなす', () => {
    expect(isCurvedLayout(0)).toBe(false);
  });

  it('負・NaN・Infinity は直線列として扱う（不正データで破綻しない）', () => {
    expect(isCurvedLayout(-5)).toBe(false);
    expect(isCurvedLayout(NaN)).toBe(false);
    expect(isCurvedLayout(Infinity)).toBe(false);
  });
});

describe('calcSeatYawOnArc', () => {
  it('列の中央席（x=0）は無回転', () => {
    expect(calcSeatYawOnArc(0, 29)).toBe(0);
  });

  it('右側の席は正、左側の席は負に回る（左右対称）', () => {
    const right = calcSeatYawOnArc(4, 29);
    const left = calcSeatYawOnArc(-4, 29);
    expect(right).toBeGreaterThan(0);
    expect(left).toBeCloseTo(-right);
  });

  it('x が大きいほど回転角も大きい', () => {
    expect(calcSeatYawOnArc(8, 36)).toBeGreaterThan(calcSeatYawOnArc(4, 36));
  });

  it('マイグレーションの x = R*sin(θ) と整合する', () => {
    const radius = 29;
    const theta = 0.1422;
    const x = radius * Math.sin(theta);
    expect(calcSeatYawOnArc(x, radius)).toBeCloseTo(theta);
  });

  it('半径を超える x でも NaN にならない（asin の定義域を外れない）', () => {
    expect(Number.isNaN(calcSeatYawOnArc(100, 29))).toBe(false);
    expect(calcSeatYawOnArc(100, 29)).toBeCloseTo(Math.PI / 2);
  });

  it('直線列（半径0）では常に0', () => {
    expect(calcSeatYawOnArc(5, 0)).toBe(0);
  });

  it('x が NaN でも 0 を返す', () => {
    expect(calcSeatYawOnArc(NaN, 29)).toBe(0);
  });
});

describe('calcArcForwardShift', () => {
  it('列の中央席（x=0）はシフトしない', () => {
    expect(calcArcForwardShift(0, 29)).toBe(0);
  });

  it('左右対称に同じだけシフトする', () => {
    expect(calcArcForwardShift(-4, 29)).toBeCloseTo(calcArcForwardShift(4, 29));
  });

  it('マイグレーションの R*(1-cos(θ)) と整合する', () => {
    const radius = 29;
    const theta = 0.1422;
    const x = radius * Math.sin(theta);
    expect(calcArcForwardShift(x, radius)).toBeCloseTo(
      radius * (1 - Math.cos(theta)),
    );
  });

  it('実データの端席で期待どおりのシフト量になる', () => {
    // standard-medium: 端席 x≈4.11 / R=29 → 約0.29m
    expect(calcArcForwardShift(4.11, 29)).toBeCloseTo(0.29, 2);
    // imax-gt: 端席 x≈8.98 / R=36 → 約1.14m
    expect(calcArcForwardShift(8.98, 36)).toBeCloseTo(1.14, 2);
  });

  it('シフト量は常に非負（弧は前方にのみせり出す）', () => {
    for (const x of [-9, -4, 0, 4, 9]) {
      expect(calcArcForwardShift(x, 36)).toBeGreaterThanOrEqual(0);
    }
  });

  it('半径を超える x でも NaN にならない', () => {
    expect(Number.isNaN(calcArcForwardShift(100, 29))).toBe(false);
    expect(calcArcForwardShift(100, 29)).toBeCloseTo(29);
  });

  it('直線列（半径0）では常に0', () => {
    expect(calcArcForwardShift(5, 0)).toBe(0);
  });
});

describe('rotateLocalOffset', () => {
  it('無回転ならそのままのオフセットを返す', () => {
    expect(rotateLocalOffset(0.27, 0.02, 0)).toEqual([0.27, 0.02]);
  });

  it('90°回転でローカルXが世界-Zへ写る', () => {
    const [x, z] = rotateLocalOffset(1, 0, Math.PI / 2);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });

  it('90°回転でローカルZが世界+Xへ写る', () => {
    const [x, z] = rotateLocalOffset(0, 1, Math.PI / 2);
    expect(x).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
  });

  it('回転してもオフセットの長さは変わらない', () => {
    const [x, z] = rotateLocalOffset(0.27, 0.02, 0.25);
    expect(Math.hypot(x, z)).toBeCloseTo(Math.hypot(0.27, 0.02));
  });

  it('左右対称な回転角で鏡像の結果になる', () => {
    const [xr, zr] = rotateLocalOffset(0.27, 0, 0.2);
    const [xl, zl] = rotateLocalOffset(0.27, 0, -0.2);
    expect(xl).toBeCloseTo(xr);
    expect(zl).toBeCloseTo(-zr);
  });
});
