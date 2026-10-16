/**
 * sightline テスト
 */

import { calcFrontRowOcclusion, findFrontSeat } from './sightline';

/** 幕: 中心Y 4.35 / 高さ 6.7 / 中心Z 10.5（standard-medium 相当） */
const SCREEN = { centerY: 4.35, height: 6.7, centerZ: 10.5 };

const occlusion = (
  seat: Parameters<typeof calcFrontRowOcclusion>[0],
  front: Parameters<typeof calcFrontRowOcclusion>[1],
) =>
  calcFrontRowOcclusion(
    seat,
    front,
    SCREEN.centerY,
    SCREEN.height,
    SCREEN.centerZ,
  );

describe('findFrontSeat', () => {
  // A列が最前（Zが大きい）、C列が最後
  const seats = [
    { row_label: 'A', position_x: -1, position_y: 0, position_z: 6 },
    { row_label: 'A', position_x: 0, position_y: 0, position_z: 6 },
    { row_label: 'A', position_x: 1, position_y: 0, position_z: 6 },
    { row_label: 'B', position_x: -1, position_y: 0.2, position_z: 5 },
    { row_label: 'B', position_x: 0, position_y: 0.2, position_z: 5 },
    { row_label: 'B', position_x: 1, position_y: 0.2, position_z: 5 },
    { row_label: 'C', position_x: 0, position_y: 0.4, position_z: 4 },
  ];

  it('前の列で横位置が最も近い席を返す', () => {
    const front = findFrontSeat(seats[6], seats); // C列中央
    expect(front?.row_label).toBe('B');
    expect(front?.position_x).toBe(0);
  });

  it('最前列では null を返す', () => {
    expect(findFrontSeat(seats[1], seats)).toBeNull();
  });

  it('横にずれた席でも前列の最も近い席を拾う', () => {
    const seat = {
      row_label: 'C',
      position_x: 0.9,
      position_y: 0.4,
      position_z: 4,
    };
    const front = findFrontSeat(seat, [...seats, seat]);
    expect(front?.position_x).toBe(1);
  });

  it('列内でZが変わる弧状列でも列を正しく特定する', () => {
    // 端席ほど前方（Zが大）にせり出す配置
    const curved = [
      { row_label: 'A', position_x: -4, position_y: 0, position_z: 6.3 },
      { row_label: 'A', position_x: 0, position_y: 0, position_z: 6 },
      { row_label: 'B', position_x: -4, position_y: 0.2, position_z: 5.3 },
      { row_label: 'B', position_x: 0, position_y: 0.2, position_z: 5 },
    ];
    // B列の端席(z=5.3)は A列中央(z=6)より手前だが、列としてはAが前
    const front = findFrontSeat(curved[2], curved);
    expect(front?.row_label).toBe('A');
    expect(front?.position_x).toBe(-4);
  });

  it('座席が空なら null を返す', () => {
    expect(findFrontSeat(seats[0], [] as typeof seats)).toBeNull();
  });
});

describe('calcFrontRowOcclusion', () => {
  it('段差が十分にあれば遮蔽なし（0）', () => {
    // 前席より 1.0m 高い席からは、前席の頭頂を完全に見下ろす
    const seat = { position_x: 0, position_y: 1.0, position_z: 5 };
    const front = { position_x: 0, position_y: 0, position_z: 6.1 };
    expect(occlusion(seat, front)).toBe(0);
  });

  it('段差が無い（平床）と遮蔽が生じる', () => {
    const seat = { position_x: 0, position_y: 0, position_z: 5 };
    const front = { position_x: 0, position_y: 0, position_z: 6.1 };
    expect(occlusion(seat, front)).toBeGreaterThan(0);
  });

  it('段差が大きいほど遮蔽が小さい', () => {
    const front = { position_x: 0, position_y: 0, position_z: 6.1 };
    const low = occlusion(
      { position_x: 0, position_y: 0.1, position_z: 5 },
      front,
    );
    const high = occlusion(
      { position_x: 0, position_y: 0.5, position_z: 5 },
      front,
    );
    expect(high).toBeLessThan(low);
  });

  it('列間隔が狭いほど遮蔽が大きい（前席の頭が近く大きく見える）', () => {
    const seat = { position_x: 0, position_y: 0, position_z: 5 };
    const near = occlusion(seat, {
      position_x: 0,
      position_y: 0,
      position_z: 5.7,
    });
    const far = occlusion(seat, {
      position_x: 0,
      position_y: 0,
      position_z: 6.5,
    });
    expect(near).toBeGreaterThan(far);
  });

  it('結果は常に 0〜1 に収まる', () => {
    for (const dy of [-1, 0, 0.3, 1]) {
      for (const dz of [0.6, 1.1, 2.0]) {
        const r = occlusion(
          { position_x: 0, position_y: 0, position_z: 5 },
          { position_x: 0, position_y: dy, position_z: 5 + dz },
        );
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    }
  });

  it('前席が極端に高いと幕が完全に隠れて1になる', () => {
    const seat = { position_x: 0, position_y: 0, position_z: 5 };
    const front = { position_x: 0, position_y: 20, position_z: 6.1 };
    expect(occlusion(seat, front)).toBe(1);
  });

  it('幕が座席の後方にある不正配置では 0 を返す', () => {
    const seat = { position_x: 0, position_y: 0, position_z: 20 };
    const front = { position_x: 0, position_y: 0, position_z: 21 };
    expect(occlusion(seat, front)).toBe(0);
  });

  it('前席が後方にある不正配置では 0 を返す', () => {
    const seat = { position_x: 0, position_y: 0, position_z: 5 };
    const front = { position_x: 0, position_y: 0, position_z: 4 };
    expect(occlusion(seat, front)).toBe(0);
  });

  it('幕の高さが0以下なら 0 を返す', () => {
    const seat = { position_x: 0, position_y: 0, position_z: 5 };
    const front = { position_x: 0, position_y: 0, position_z: 6.1 };
    expect(calcFrontRowOcclusion(seat, front, 4.35, 0, 10.5)).toBe(0);
  });
});
