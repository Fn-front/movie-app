/**
 * aisleGeometry テスト
 */

import type { SeatXSegment } from './theaterGeometry';
import {
  calcNormalGap,
  computeAisleSideSeatIds,
  computeAisleSteps,
  computeAisleXRanges,
  computeCrossAisleRails,
  isCrossAisleGap,
} from './aisleGeometry';

/** 座席ブロック2つ（中央に縦通路、両端にサイド通路）。室幅 14 を想定 */
const TWO_BLOCKS: SeatXSegment[] = [
  { center: -4, width: 4 }, // -6 〜 -2
  { center: 4, width: 4 }, // 2 〜 6
];

describe('isCrossAisleGap', () => {
  it('通常間隔の1.5倍を超える間隔を横通路とみなす', () => {
    expect(isCrossAisleGap(1.6, 1)).toBe(true);
    expect(isCrossAisleGap(1.4, 1)).toBe(false);
  });

  it('ちょうど1.5倍は横通路としない（段差として扱う）', () => {
    expect(isCrossAisleGap(1.5, 1)).toBe(false);
  });

  it('倍率を指定できる', () => {
    expect(isCrossAisleGap(2.5, 1, 3)).toBe(false);
    expect(isCrossAisleGap(3.5, 1, 3)).toBe(true);
  });

  it('通常間隔が0以下なら常に false（判定不能時に誤検出しない）', () => {
    expect(isCrossAisleGap(10, 0)).toBe(false);
    expect(isCrossAisleGap(10, -1)).toBe(false);
  });
});

describe('calcNormalGap', () => {
  it('隣接する差のうち最小の正の値を返す', () => {
    expect(calcNormalGap([10, 9, 8, 5])).toBe(1);
  });

  it('降順・昇順どちらでも同じ結果になる', () => {
    expect(calcNormalGap([1, 2, 4])).toBe(calcNormalGap([4, 2, 1]));
  });

  it('epsilon 以下の差は同一位置とみなして無視する', () => {
    // 隣接差は |5-5.005|=0.005（無視）と |5.005-4|=1.005 → 後者が採用される
    expect(calcNormalGap([5, 5.005, 4])).toBeCloseTo(1.005);
  });

  it('要素が0個・1個なら 0 を返す', () => {
    expect(calcNormalGap([])).toBe(0);
    expect(calcNormalGap([3])).toBe(0);
  });

  it('全要素が同一位置なら 0 を返す', () => {
    expect(calcNormalGap([2, 2, 2])).toBe(0);
  });
});

describe('computeAisleXRanges', () => {
  it('ブロック間の隙間とサイド通路の両方を返す', () => {
    const aisles = computeAisleXRanges(TWO_BLOCKS, 14);
    expect(aisles).toHaveLength(3);
    expect(aisles.map((a) => a.center)).toEqual([-6.5, 0, 6.5]);
  });

  it('側壁に接する通路だけ isSide が true になる', () => {
    const aisles = computeAisleXRanges(TWO_BLOCKS, 14);
    expect(aisles.map((a) => a.isSide)).toEqual([true, false, true]);
  });

  it('通路幅が正しく算出される', () => {
    const aisles = computeAisleXRanges(TWO_BLOCKS, 14);
    // 左: -7 〜 -6 = 1、中央: -2 〜 2 = 4、右: 6 〜 7 = 1
    expect(aisles.map((a) => a.width)).toEqual([1, 4, 1]);
  });

  it('minWidth 未満の隙間は通路としない（座席間の肘掛けを拾わない）', () => {
    // ブロック間が 0.4m しかないケース
    const narrow: SeatXSegment[] = [
      { center: -2, width: 3.6 }, // -3.8 〜 -0.2
      { center: 2, width: 3.6 }, // 0.2 〜 3.8
    ];
    const aisles = computeAisleXRanges(narrow, 14);
    expect(aisles.map((a) => a.center)).toEqual([-5.4, 5.4]); // 中央は除外
  });

  it('ブロックが1つなら両側のサイド通路だけ返す', () => {
    const aisles = computeAisleXRanges([{ center: 0, width: 8 }], 14);
    expect(aisles).toHaveLength(2);
    expect(aisles.every((a) => a.isSide)).toBe(true);
  });

  it('座席が壁いっぱいに広がっていれば通路ゼロ', () => {
    expect(computeAisleXRanges([{ center: 0, width: 14 }], 14)).toEqual([]);
  });

  it('セグメントが順不同でも結果は同じ', () => {
    expect(computeAisleXRanges([...TWO_BLOCKS].reverse(), 14)).toEqual(
      computeAisleXRanges(TWO_BLOCKS, 14),
    );
  });

  it('座席が無い・室幅が不正なら空配列を返す', () => {
    expect(computeAisleXRanges([], 14)).toEqual([]);
    expect(computeAisleXRanges(TWO_BLOCKS, 0)).toEqual([]);
    expect(computeAisleXRanges(TWO_BLOCKS, -14)).toEqual([]);
  });
});

describe('computeAisleSteps', () => {
  const aisles = computeAisleXRanges(TWO_BLOCKS, 14);
  // 前(z=5) → 後(z=2) の降順、各列 0.2m ずつ上がる
  const rowZs = [5, 4, 3, 2];
  const rowYs = [0, 0.2, 0.4, 0.6];

  it('段数は 通路数 × 列数 になる', () => {
    expect(computeAisleSteps(aisles, rowZs, rowYs)).toHaveLength(
      aisles.length * rowZs.length,
    );
  });

  it('踏面の高さはその列の床高と一致する（座席が浮かない）', () => {
    const steps = computeAisleSteps([aisles[1]], rowZs, rowYs);
    expect(steps.map((s) => s.topY)).toEqual(rowYs);
  });

  it('蹴込みの高さは前列との高低差になる', () => {
    const steps = computeAisleSteps([aisles[1]], rowZs, rowYs);
    expect(steps.slice(1).map((s) => Number(s.riseHeight.toFixed(10)))).toEqual(
      [0.2, 0.2, 0.2],
    );
  });

  it('最前列は前段が無いので蹴込みを持たない', () => {
    const steps = computeAisleSteps([aisles[1]], rowZs, rowYs);
    expect(steps[0].riseHeight).toBe(0);
  });

  it('横通路の手前では蹴込みを立てない', () => {
    // z=3 と z=5 の間が 2m（通常 1m の2倍）＝横通路
    const zs = [6, 5, 3, 2];
    const ys = [0, 0.2, 0.4, 0.6];
    const steps = computeAisleSteps([aisles[1]], zs, ys);
    expect(steps.map((s) => s.riseHeight > 0)).toEqual([
      false, // 最前列
      true, // 通常段
      false, // 横通路の手前
      true, // 通常段
    ]);
  });

  it('踏面の奥行は通常列間隔になる', () => {
    const steps = computeAisleSteps([aisles[1]], rowZs, rowYs);
    expect(steps.every((s) => s.depth === 1)).toBe(true);
  });

  it('蹴込み面は踏面の前端（スクリーン側）に立つ', () => {
    const steps = computeAisleSteps([aisles[1]], rowZs, rowYs);
    steps.forEach((s) => expect(s.riserZ).toBeCloseTo(s.centerZ + s.depth / 2));
  });

  it('踏面の幅と中心は通路に一致する', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs);
    for (const aisle of aisles) {
      const own = steps.filter((s) => s.centerX === aisle.center);
      expect(own).toHaveLength(rowZs.length);
      expect(own.every((s) => s.width === aisle.width)).toBe(true);
    }
  });

  it('平床（全列が同じ高さ）なら蹴込みはすべて0', () => {
    const steps = computeAisleSteps([aisles[1]], rowZs, [0, 0, 0, 0]);
    expect(steps.every((s) => s.riseHeight === 0)).toBe(true);
  });

  it('列が1本でも踏面を1つ生成する（奥行は既定値）', () => {
    const steps = computeAisleSteps([aisles[1]], [3], [0]);
    expect(steps).toHaveLength(1);
    expect(steps[0].depth).toBe(1);
    expect(steps[0].riseHeight).toBe(0);
  });

  it('通路が無い・列が無い・配列長が不一致なら空配列を返す', () => {
    expect(computeAisleSteps([], rowZs, rowYs)).toEqual([]);
    expect(computeAisleSteps(aisles, [], [])).toEqual([]);
    expect(computeAisleSteps(aisles, rowZs, [0, 0.2])).toEqual([]);
  });
});

describe('computeCrossAisleRails', () => {
  it('横通路の後ろ側の列の前縁に、座席ブロックごとに腰壁を立てる', () => {
    // z=3 と z=5 の間が 2m（通常 1m の2倍）＝横通路
    const zs = [6, 5, 3, 2];
    const ys = [0, 0.2, 0.4, 0.6];
    const rails = computeCrossAisleRails(TWO_BLOCKS, zs, ys);
    expect(rails).toHaveLength(TWO_BLOCKS.length);
    expect(rails.map((r) => r.centerX)).toEqual([-4, 4]);
  });

  it('腰壁は横通路の後ろ側の列の床高に乗る', () => {
    const zs = [6, 5, 3, 2];
    const ys = [0, 0.2, 0.4, 0.6];
    const rails = computeCrossAisleRails(TWO_BLOCKS, zs, ys);
    expect(rails.every((r) => r.baseY === 0.4)).toBe(true);
  });

  it('腰壁の幅は座席ブロックの幅に一致する（通路部分は開口する）', () => {
    const zs = [6, 5, 3, 2];
    const ys = [0, 0.2, 0.4, 0.6];
    const rails = computeCrossAisleRails(TWO_BLOCKS, zs, ys);
    expect(rails.map((r) => r.width)).toEqual([4, 4]);
  });

  it('横通路が無ければ空配列を返す', () => {
    const rails = computeCrossAisleRails(
      TWO_BLOCKS,
      [5, 4, 3, 2],
      [0, 0.2, 0.4, 0.6],
    );
    expect(rails).toEqual([]);
  });

  it('横通路が2箇所あればそれぞれに立てる', () => {
    // z=8→7(通常1) / 7→5(横通路) / 5→4(通常) / 4→2(横通路)
    const zs = [8, 7, 5, 4, 2];
    const ys = [0, 0.2, 0.4, 0.6, 0.8];
    const rails = computeCrossAisleRails(TWO_BLOCKS, zs, ys);
    expect(rails).toHaveLength(TWO_BLOCKS.length * 2);
  });

  it('座席が無い・列が1本以下・配列長が不一致なら空配列を返す', () => {
    expect(computeCrossAisleRails([], [5, 4], [0, 0.2])).toEqual([]);
    expect(computeCrossAisleRails(TWO_BLOCKS, [5], [0])).toEqual([]);
    expect(computeCrossAisleRails(TWO_BLOCKS, [5, 4], [0])).toEqual([]);
  });
});

describe('computeAisleSideSeatIds', () => {
  /** -6〜-2 と 2〜6 の2ブロック。各ブロックに3席ずつ */
  const seats = [
    { id: 'a1', row_label: 'A', position_x: -5 },
    { id: 'a2', row_label: 'A', position_x: -4 },
    { id: 'a3', row_label: 'A', position_x: -3 },
    { id: 'a4', row_label: 'A', position_x: 3 },
    { id: 'a5', row_label: 'A', position_x: 4 },
    { id: 'a6', row_label: 'A', position_x: 5 },
  ];

  it('各ブロックの左右端の席だけを返す', () => {
    const map = computeAisleSideSeatIds(seats, TWO_BLOCKS);
    expect([...map.keys()].sort()).toEqual(['a1', 'a3', 'a4', 'a6']);
  });

  it('ブロック中央の席は含まない', () => {
    const map = computeAisleSideSeatIds(seats, TWO_BLOCKS);
    expect(map.has('a2')).toBe(false);
    expect(map.has('a5')).toBe(false);
  });

  it('向きはブロック中心からの外向きになる（室中心基準ではない）', () => {
    const map = computeAisleSideSeatIds(seats, TWO_BLOCKS);
    // 左ブロック: a1 が左端 → -1、a3 が右端（中央通路側）→ +1
    expect(map.get('a1')).toBe(-1);
    expect(map.get('a3')).toBe(1);
    // 右ブロック: a4 が左端（中央通路側）→ -1、a6 が右端 → +1
    expect(map.get('a4')).toBe(-1);
    expect(map.get('a6')).toBe(1);
  });

  it('中央通路に面する席は通路側を向く（室中心基準だと逆になるケース）', () => {
    const map = computeAisleSideSeatIds(seats, TWO_BLOCKS);
    // a4 は x>0 だが、中央通路は左側にある。室中心基準(x>=0 → +1)だと誤る
    expect(map.get('a4')).toBe(-1);
  });

  it('列ごとに独立して端を判定する（列で席数が違っても正しい）', () => {
    const mixed = [
      ...seats,
      { id: 'b1', row_label: 'B', position_x: -4 },
      { id: 'b2', row_label: 'B', position_x: -3 },
    ];
    const map = computeAisleSideSeatIds(mixed, TWO_BLOCKS);
    expect(map.get('b1')).toBe(-1);
    expect(map.get('b2')).toBe(1);
  });

  it('1席しかない列ではその席を左端として扱う', () => {
    const single = [{ id: 'z1', row_label: 'Z', position_x: -4 }];
    const map = computeAisleSideSeatIds(single, TWO_BLOCKS);
    expect(map.size).toBe(1);
    expect(map.get('z1')).toBe(-1);
  });

  it('どのブロックにも属さない席は無視する', () => {
    const outside = [{ id: 'x1', row_label: 'A', position_x: 100 }];
    expect(computeAisleSideSeatIds(outside, TWO_BLOCKS).size).toBe(0);
  });

  it('座席・セグメントが空なら空の Map を返す', () => {
    expect(computeAisleSideSeatIds([], TWO_BLOCKS).size).toBe(0);
    expect(computeAisleSideSeatIds(seats, []).size).toBe(0);
  });
});

describe('弧状列への追従', () => {
  const aisles = computeAisleXRanges(TWO_BLOCKS, 14);
  const rowZs = [5, 4, 3, 2];
  const rowYs = [0, 0.2, 0.4, 0.6];

  it('直線列（半径0）では段のZが代表Zと一致する', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs, 0);
    const center = steps.filter((s) => s.centerX === 0);
    expect(center.map((s) => s.centerZ)).toEqual(rowZs);
  });

  it('弧状列では通路の位置に応じて段が前方へシフトする', () => {
    const radius = 29;
    const steps = computeAisleSteps(aisles, rowZs, rowYs, radius);
    // 中央通路(center=0)はシフトなし
    const center = steps.filter((s) => s.centerX === 0);
    expect(center.map((s) => s.centerZ)).toEqual(rowZs);
    // サイド通路(center=±6.5)は前方（+Z）へずれる
    const side = steps.filter((s) => s.centerX === 6.5);
    side.forEach((s, i) => expect(s.centerZ).toBeGreaterThan(rowZs[i]));
  });

  it('左右のサイド通路は同じだけシフトする（対称）', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs, 29);
    const left = steps.filter((s) => s.centerX === -6.5).map((s) => s.centerZ);
    const right = steps.filter((s) => s.centerX === 6.5).map((s) => s.centerZ);
    left.forEach((z, i) => expect(z).toBeCloseTo(right[i]));
  });

  it('蹴込み面は常に踏面の前端にある（シフト後も整合する）', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs, 29);
    steps.forEach((s) => expect(s.riserZ).toBeCloseTo(s.centerZ + s.depth / 2));
  });

  it('蹴込みの高さは弧の有無で変わらない（高さは列のYのみに依存）', () => {
    const straight = computeAisleSteps(aisles, rowZs, rowYs, 0);
    const curved = computeAisleSteps(aisles, rowZs, rowYs, 29);
    expect(curved.map((s) => s.riseHeight)).toEqual(
      straight.map((s) => s.riseHeight),
    );
  });

  it('腰壁も弧に沿って前方へシフトする', () => {
    const zs = [6, 5, 3, 2];
    const ys = [0, 0.2, 0.4, 0.6];
    const straight = computeCrossAisleRails(TWO_BLOCKS, zs, ys, 0);
    const curved = computeCrossAisleRails(TWO_BLOCKS, zs, ys, 29);
    expect(curved).toHaveLength(straight.length);
    curved.forEach((r, i) => expect(r.z).toBeGreaterThan(straight[i].z));
  });

  it('腰壁の高さと幅は弧の有無で変わらない', () => {
    const zs = [6, 5, 3, 2];
    const ys = [0, 0.2, 0.4, 0.6];
    const curved = computeCrossAisleRails(TWO_BLOCKS, zs, ys, 29);
    expect(curved.map((r) => r.baseY)).toEqual([0.4, 0.4]);
    expect(curved.map((r) => r.width)).toEqual([4, 4]);
  });
});

describe('aisleIndex（手すりが通路をまたいで繋がるのを防ぐ）', () => {
  const aisles = computeAisleXRanges(TWO_BLOCKS, 14);
  const rowZs = [5, 4, 3, 2];
  const rowYs = [0, 0.2, 0.4, 0.6];

  it('各段がどの通路に属するかを持つ', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs);
    expect(steps.every((s) => Number.isInteger(s.aisleIndex))).toBe(true);
  });

  it('aisleIndex は通路の並び順に 0 から振られる', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs);
    expect([...new Set(steps.map((s) => s.aisleIndex))]).toEqual(
      aisles.map((_, i) => i),
    );
  });

  it('同じ aisleIndex の段は同じ通路中心を持つ', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs);
    for (let i = 0; i < aisles.length; i++) {
      const own = steps.filter((s) => s.aisleIndex === i);
      expect(new Set(own.map((s) => s.centerX)).size).toBe(1);
      expect(own).toHaveLength(rowZs.length);
    }
  });

  it('配列上で隣接していても通路が変わる境界が存在する', () => {
    // この境界で steps[i+1] を無条件に繋ぐと、笠木が客席エリアの全奥行を貫く
    const steps = computeAisleSteps(aisles, rowZs, rowYs);
    const boundaries = steps.filter(
      (s, i) => steps[i + 1] && steps[i + 1].aisleIndex !== s.aisleIndex,
    );
    expect(boundaries).toHaveLength(aisles.length - 1);
  });

  it('通路の境界では前後位置が大きく飛ぶ（繋いではいけないことの根拠）', () => {
    const steps = computeAisleSteps(aisles, rowZs, rowYs);
    const i = steps.findIndex(
      (s, idx) => steps[idx + 1] && steps[idx + 1].aisleIndex !== s.aisleIndex,
    );
    const jump = Math.abs(steps[i + 1].centerZ - steps[i].centerZ);
    const normalStep = Math.abs(steps[1].centerZ - steps[0].centerZ);
    // 境界の飛びは通常の段差の数倍になる
    expect(jump).toBeGreaterThan(normalStep * 2);
  });
});
