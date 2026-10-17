/**
 * projectorBeam テスト
 */

import {
  PROJECTION_PORT_WIDTH,
  calcProjectionPortY,
  computeProjectorBeamQuads,
  isProjectorBeamVisible,
} from './projectorBeam';

/** standard-medium 相当（映写窓 y=3.4 / 後壁 z=-10.5、幕 中心y=4.35 z=12.5 / 16×6.7） */
const quads = () => computeProjectorBeamQuads(3.4, -10.5, 4.35, 12.5, 16, 6.7);

/** 頂点配列から i 番目の点を取り出す */
const pt = (v: number[], i: number) => v.slice(i * 3, i * 3 + 3);

describe('computeProjectorBeamQuads', () => {
  it('各台形が4頂点（12要素）を持つ', () => {
    const { horizontal, vertical } = quads();
    expect(horizontal).toHaveLength(12);
    expect(vertical).toHaveLength(12);
  });

  it('根元の幅は映写窓の幅に一致する（別々に持たない）', () => {
    const { horizontal } = quads();
    const span = Math.abs(pt(horizontal, 1)[0] - pt(horizontal, 0)[0]);
    expect(span).toBeCloseTo(PROJECTION_PORT_WIDTH, 10);
  });

  it('映写窓側は細く、スクリーン側は幕の幅まで開く', () => {
    const { horizontal } = quads();
    const portLeft = pt(horizontal, 0);
    const portRight = pt(horizontal, 1);
    const screenRight = pt(horizontal, 2);

    const portSpan = Math.abs(portRight[0] - portLeft[0]);
    const screenSpan = Math.abs(screenRight[0]) * 2;
    expect(portSpan).toBeLessThan(1);
    expect(screenSpan).toBeGreaterThan(portSpan * 10);
  });

  it('スクリーン側は幕より僅かに内側に収まる（黒マスキングに掛けない）', () => {
    const { horizontal, vertical } = quads();
    expect(Math.abs(pt(horizontal, 2)[0])).toBeLessThan(16 / 2);
    // 垂直側も同様に幕の上端より内側
    expect(pt(vertical, 2)[1]).toBeLessThan(4.35 + 6.7 / 2);
  });

  it('2枚の台形は直交する（水平はX方向、垂直はY方向に開く）', () => {
    const { horizontal, vertical } = quads();
    // 水平台形は X が広がり、Y は窓とスクリーン中心を結ぶ線上
    expect(pt(horizontal, 0)[1]).toBe(pt(horizontal, 1)[1]);
    // 垂直台形は X が常に0
    for (let i = 0; i < 4; i++) expect(pt(vertical, i)[0]).toBe(0);
  });

  it('映写窓側の頂点は後壁のZに乗る', () => {
    const { horizontal, vertical } = quads();
    expect(pt(horizontal, 0)[2]).toBe(-10.5);
    expect(pt(vertical, 0)[2]).toBe(-10.5);
  });

  it('スクリーン側の頂点は幕より手前で止まる（幕に縁が線として出るのを防ぐ）', () => {
    const { horizontal, vertical } = quads();
    expect(pt(horizontal, 2)[2]).toBeLessThan(12.5);
    expect(pt(vertical, 2)[2]).toBeLessThan(12.5);
    // ただし手前へ下げすぎない（幕に届いて見える必要がある）
    expect(pt(horizontal, 2)[2]).toBeGreaterThan(12.5 - 1);
  });

  it('負の寸法でも頂点が発散しない', () => {
    const { horizontal } = computeProjectorBeamQuads(3, -10, 4, 12, -5, -2);
    expect(horizontal.every(Number.isFinite)).toBe(true);
  });
});

describe('calcProjectionPortY', () => {
  it('最上段通路より上に置く', () => {
    expect(calcProjectionPortY(11, 3.4)).toBeGreaterThan(3.4);
  });

  it('天井を突き抜けない', () => {
    const roomHeight = 7;
    expect(calcProjectionPortY(roomHeight, 6)).toBeLessThan(roomHeight);
  });
});

describe('isProjectorBeamVisible', () => {
  const visible = (over: Partial<Record<string, number>> = {}) =>
    isProjectorBeamVisible(
      over.portY ?? 3.4,
      over.portZ ?? -10.5,
      over.screenCenterY ?? 4.35,
      over.screenCenterZ ?? 12.5,
      over.screenWidth ?? 16,
      over.screenHeight ?? 6.7,
    );

  it('映写窓がスクリーンより後ろなら描画する', () => {
    expect(visible()).toBe(true);
  });

  it('映写窓がスクリーンより前なら描画しない（台形が裏返るため）', () => {
    expect(visible({ portZ: 13 })).toBe(false);
  });

  it('同じZなら描画しない', () => {
    expect(visible({ portZ: 12.5 })).toBe(false);
  });

  it('幕の寸法が0なら描画しない', () => {
    expect(visible({ screenWidth: 0 })).toBe(false);
    expect(visible({ screenHeight: 0 })).toBe(false);
  });

  it('いずれかの座標が非有限なら描画しない（NaN頂点でboundingSphereが壊れる）', () => {
    // DBの値欠損が Number() 経由で NaN になるケースを全軸で弾く
    for (const axis of [
      'portY',
      'portZ',
      'screenCenterY',
      'screenCenterZ',
    ] as const) {
      expect(visible({ [axis]: Number.NaN })).toBe(false);
      expect(visible({ [axis]: Number.POSITIVE_INFINITY })).toBe(false);
    }
  });
});
