/**
 * wallGeometry テスト
 */

import {
  calcFacetRadius,
  computeCeilingLightPlacements,
  computeFacetPlacements,
  computeRibPlacements,
  isWallHiddenInOverview,
} from './wallGeometry';

describe('computeRibPlacements', () => {
  it('壁長を本数で等分し各区画の中央に置く', () => {
    // 壁長 4m / 間隔 1m → 4本、step=1、中心は -1.5, -0.5, 0.5, 1.5
    expect(computeRibPlacements(4, 1).map((r) => r.offset)).toEqual([
      -1.5, -0.5, 0.5, 1.5,
    ]);
  });

  it('両端に半ピッチの余白を残す（壁の入隅でリブが潰れない）', () => {
    const ribs = computeRibPlacements(10, 2);
    const step = 10 / 5;
    expect(ribs[0].offset).toBeCloseTo(-10 / 2 + step / 2);
    expect(ribs[ribs.length - 1].offset).toBeCloseTo(10 / 2 - step / 2);
  });

  it('壁中央に対して左右対称に並ぶ', () => {
    const offsets = computeRibPlacements(9, 1.2).map((r) => r.offset);
    const reversed = [...offsets].reverse().map((o) => -o);
    offsets.forEach((o, i) => expect(o).toBeCloseTo(reversed[i]));
  });

  it('本数は壁長を間隔で割った整数部になる', () => {
    expect(computeRibPlacements(10, 3)).toHaveLength(3);
    expect(computeRibPlacements(30, 0.35)).toHaveLength(85);
  });

  it('壁長が間隔に満たなければ空配列を返す', () => {
    expect(computeRibPlacements(0.3, 0.35)).toEqual([]);
  });

  it('寸法がゼロ・負でも例外を投げず空配列を返す', () => {
    expect(computeRibPlacements(0, 1)).toEqual([]);
    expect(computeRibPlacements(-5, 1)).toEqual([]);
    expect(computeRibPlacements(10, 0)).toEqual([]);
    expect(computeRibPlacements(10, -1)).toEqual([]);
  });
});

describe('computeFacetPlacements', () => {
  it('壁を格子に分割し1セル1ユニットを置く', () => {
    // 幅 8m / 高さ 4m / ユニット 2m → 4列 × 2行 = 8個
    expect(computeFacetPlacements(8, 4, 2)).toHaveLength(8);
  });

  it('自転角は 0 と π/4 の2値のみを取る', () => {
    for (const f of computeFacetPlacements(12, 6, 1.6)) {
      expect([0, Math.PI / 4]).toContain(f.spin);
    }
  });

  it('突出量が1種類に偏らない（規則的な反復に見えない）', () => {
    const depths = new Set(
      computeFacetPlacements(12, 6, 1.6).map((f) => f.depth),
    );
    expect(depths.size).toBeGreaterThan(1);
  });

  it('同じ行で隣り合うユニットの見た目が連続しない', () => {
    const units = computeFacetPlacements(12, 1.6, 1.6); // 1行だけ切り出す
    for (let i = 1; i < units.length; i++) {
      const prev = units[i - 1];
      const cur = units[i];
      expect(prev.spin === cur.spin && prev.depth === cur.depth).toBe(false);
    }
  });

  it('高さは造作帯の内側に収まる', () => {
    const bandHeight = 5;
    for (const f of computeFacetPlacements(10, bandHeight, 1.6)) {
      expect(f.height).toBeGreaterThan(0);
      expect(f.height).toBeLessThan(bandHeight);
    }
  });

  it('壁中央に対して左右対称な位置に並ぶ', () => {
    const offsets = computeFacetPlacements(8, 1.6, 2).map((f) => f.offset);
    expect(offsets).toEqual([-3, -1, 1, 3]);
  });

  it('ユニットより小さい壁でも最低1行1列は生成する', () => {
    expect(computeFacetPlacements(1, 1, 1.6)).toHaveLength(1);
  });

  it('寸法がゼロ・負でも例外を投げず空配列を返す', () => {
    expect(computeFacetPlacements(0, 4, 1.6)).toEqual([]);
    expect(computeFacetPlacements(8, 0, 1.6)).toEqual([]);
    expect(computeFacetPlacements(8, 4, 0)).toEqual([]);
    expect(computeFacetPlacements(-8, 4, 1.6)).toEqual([]);
  });

  it('決定論的（同じ入力で同じ結果）', () => {
    expect(computeFacetPlacements(12, 6, 1.6)).toEqual(
      computeFacetPlacements(12, 6, 1.6),
    );
  });
});

describe('calcFacetRadius', () => {
  it('四角錐の底面の一辺がセル幅と一致する半径を返す', () => {
    // 幅 8m / ユニット 2m → 4列、セル幅 2m。一辺 2m の正方形の外接円半径 = 2/√2
    expect(calcFacetRadius(8, 2)).toBeCloseTo(2 / Math.SQRT2);
  });

  it('寸法がゼロ・負なら 0 を返す', () => {
    expect(calcFacetRadius(0, 2)).toBe(0);
    expect(calcFacetRadius(8, 0)).toBe(0);
    expect(calcFacetRadius(-8, 2)).toBe(0);
  });
});

describe('computeCeilingLightPlacements', () => {
  it('幅・奥行を等分した格子に配置する', () => {
    // 10m × 10m / 間隔 2.5m → 4 × 4 = 16灯
    expect(computeCeilingLightPlacements(10, 10, 2.5)).toHaveLength(16);
  });

  it('両端に半ピッチの余白を残す（壁際に寄りすぎない）', () => {
    const lights = computeCeilingLightPlacements(10, 10, 2.5);
    const xs = lights.map((l) => l.x);
    expect(Math.min(...xs)).toBeCloseTo(-10 / 2 + 2.5 / 2);
    expect(Math.max(...xs)).toBeCloseTo(10 / 2 - 2.5 / 2);
  });

  it('室中心に対して左右対称に並ぶ', () => {
    const xs = [
      ...new Set(computeCeilingLightPlacements(12, 6, 3).map((l) => l.x)),
    ].sort((a, b) => a - b);
    const mirrored = [...xs].reverse().map((x) => -x);
    xs.forEach((x, i) => expect(x).toBeCloseTo(mirrored[i]));
  });

  it('間隔より小さい部屋でも最低1灯は置く', () => {
    expect(computeCeilingLightPlacements(2, 2, 2.5)).toHaveLength(1);
  });

  it('最大規模（IMAX 29m × 26m）でも灯数が過大にならない', () => {
    // 11 × 10 = 110灯。InstancedMesh 1つで賄える範囲に収まる
    expect(computeCeilingLightPlacements(29, 26, 2.5).length).toBeLessThan(200);
  });

  it('寸法がゼロ・負でも例外を投げず空配列を返す', () => {
    expect(computeCeilingLightPlacements(0, 10, 2.5)).toEqual([]);
    expect(computeCeilingLightPlacements(10, 0, 2.5)).toEqual([]);
    expect(computeCeilingLightPlacements(10, 10, 0)).toEqual([]);
    expect(computeCeilingLightPlacements(10, -10, 2.5)).toEqual([]);
  });
});

describe('isWallHiddenInOverview', () => {
  it('俯瞰カメラ側（+X / +Z）の壁は隠す', () => {
    expect(isWallHiddenInOverview(7, 0)).toBe(true); // 右壁
    expect(isWallHiddenInOverview(0, 10)).toBe(true); // スクリーン側壁
  });

  it('奥側（-X / -Z）の壁は描く（室内が見通せる面）', () => {
    expect(isWallHiddenInOverview(-7, 0)).toBe(false); // 左壁
    expect(isWallHiddenInOverview(0, -10)).toBe(false); // 後壁
  });

  it('原点上の壁（座標0）は隠さない', () => {
    expect(isWallHiddenInOverview(0, 0)).toBe(false);
  });
});
