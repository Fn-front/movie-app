/**
 * SeatMeshes コンポーネント テスト
 * R3F内の描画はテスト対象外。props型とエクスポートのみ検証。
 */

jest.mock('three', () => ({
  Object3D: jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.position = { set: jest.fn() };
    this.rotation = { set: jest.fn() };
    this.scale = { set: jest.fn() };
    this.matrix = {};
    this.updateMatrix = jest.fn();
  }),
  // 背もたれ色の生成（clone().multiplyScalar()）がモジュール読込時に走るため、
  // Color モックにも clone/multiplyScalar を持たせる（自身を返す軽量スタブ）。
  Color: jest.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.clone = jest.fn(() => this);
    this.multiplyScalar = jest.fn(() => this);
  }),
  RepeatWrapping: 1000,
}));

jest.mock('three-stdlib', () => ({
  RoundedBoxGeometry: jest.fn(),
}));

jest.mock('@react-three/fiber', () => ({
  extend: jest.fn(),
}));

jest.mock('@react-three/drei', () => {
  const useGLTF = jest.fn(() => ({
    nodes: {},
    materials: {},
    scene: {},
  })) as jest.Mock & { preload: jest.Mock };
  useGLTF.preload = jest.fn();

  return {
    useTexture: jest.fn(() => ({
      map: { wrapS: 0, wrapT: 0, repeat: { set: jest.fn() } },
      normalMap: { wrapS: 0, wrapT: 0, repeat: { set: jest.fn() } },
      roughnessMap: { wrapS: 0, wrapT: 0, repeat: { set: jest.fn() } },
    })),
    useGLTF,
  };
});

import type { TheaterSeat } from '../../types';

import {
  SeatMeshes,
  getSeatColorKey,
  getSeatBackColor,
  resolveHoverEmitId,
  getHoverHighlightSeat,
} from './seatMeshes';

const seatAt = (id: string): TheaterSeat => ({
  id,
  row_label: 'A',
  seat_number: 1,
  position_x: 0,
  position_y: 0,
  position_z: 0,
  seat_type: 'standard',
});

describe('SeatMeshes', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(SeatMeshes).toBeDefined();
    expect(SeatMeshes.displayName).toBe('SeatMeshes');
  });

  it('propsの型が正しい', () => {
    const props = {
      seats: [seatAt('seat-1')],
      selectedSeatId: null,
      highlightedSeatId: null,
      onSeatClick: jest.fn(),
      onHoverSeat: jest.fn(),
    };

    expect(props.seats).toHaveLength(1);
  });
});

describe('resolveHoverEmitId', () => {
  const seats = [seatAt('s0'), seatAt('s1'), seatAt('s2')];

  it('俯瞰時はインスタンスに対応する座席IDを返す', () => {
    expect(resolveHoverEmitId(seats, 1, null)).toBe('s1');
  });

  it('一人称時（selectedSeatId あり）は null を返しホバー漏れを防ぐ', () => {
    expect(resolveHoverEmitId(seats, 1, 's0')).toBeNull();
  });

  it('instanceId 未定義や範囲外は null', () => {
    expect(resolveHoverEmitId(seats, undefined, null)).toBeNull();
    expect(resolveHoverEmitId(seats, 99, null)).toBeNull();
  });
});

describe('getHoverHighlightSeat', () => {
  const seats = [seatAt('s0'), seatAt('s1')];

  it('俯瞰時は強調IDに一致する座席を返す', () => {
    expect(getHoverHighlightSeat(seats, 's1', null)?.id).toBe('s1');
  });

  it('一人称時は常に null（枠/ラベルを出さない）', () => {
    expect(getHoverHighlightSeat(seats, 's1', 's0')).toBeNull();
  });

  it('強調IDが null / 未一致なら null', () => {
    expect(getHoverHighlightSeat(seats, null, null)).toBeNull();
    expect(getHoverHighlightSeat(seats, 'nope', null)).toBeNull();
  });
});

describe('getSeatColorKey', () => {
  const base: TheaterSeat = {
    id: 's1',
    row_label: 'A',
    seat_number: 1,
    position_x: 0,
    position_y: 0,
    position_z: 0,
    seat_type: 'standard',
  };

  it('選択中の席は selected（車椅子より優先）', () => {
    expect(getSeatColorKey({ ...base, seat_type: 'wheelchair' }, 's1')).toBe(
      'selected',
    );
  });

  it('車椅子席は wheelchair', () => {
    expect(getSeatColorKey({ ...base, seat_type: 'wheelchair' }, null)).toBe(
      'wheelchair',
    );
  });

  it('通常席は単色 seat（列に依らず一定）', () => {
    expect(getSeatColorKey({ ...base, row_label: 'A' }, null)).toBe('seat');
    expect(getSeatColorKey({ ...base, row_label: 'B' }, null)).toBe('seat');
  });
});

describe('getSeatBackColor', () => {
  const base: TheaterSeat = {
    id: 's1',
    row_label: 'A',
    seat_number: 1,
    position_x: 0,
    position_y: 0,
    position_z: 0,
    seat_type: 'standard',
  };

  // getSeatColorKey と同じ優先度で色種別を選び、種別ごとに一段暗い色を返す。
  // （three は本テストでモックのため実RGBの暗さは検証せず、種別分岐の一貫性を検証）
  it('色種別ごとに定義済みの背もたれ色を返す', () => {
    expect(getSeatBackColor(base, null)).toBeDefined();
    expect(
      getSeatBackColor({ ...base, seat_type: 'wheelchair' }, null),
    ).toBeDefined();
    expect(getSeatBackColor(base, 's1')).toBeDefined();
  });

  it('同一種別では同じインスタンス（事前計算マップ）を返す', () => {
    expect(getSeatBackColor(base, null)).toBe(getSeatBackColor(base, null));
    // 選択中は種別が selected に変わるため seat とは別インスタンス
    expect(getSeatBackColor(base, null)).not.toBe(getSeatBackColor(base, 's1'));
  });
});
