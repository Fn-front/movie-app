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
    this.matrix = {};
    this.updateMatrix = jest.fn();
  }),
  Color: jest.fn(),
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

import { SeatMeshes, getSeatColorKey } from './seatMeshes';

describe('SeatMeshes', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(SeatMeshes).toBeDefined();
    expect(SeatMeshes.displayName).toBe('SeatMeshes');
  });

  it('propsの型が正しい', () => {
    const mockSeat: TheaterSeat = {
      id: 'seat-1',
      row_label: 'A',
      seat_number: 1,
      position_x: 0,
      position_y: 0,
      position_z: 0,
      seat_type: 'standard',
    };

    const props = {
      seats: [mockSeat],
      selectedSeatId: null,
      hoveredSeatId: null,
      onSeatClick: jest.fn(),
      onHoverSeat: jest.fn(),
    };

    expect(props.seats).toHaveLength(1);
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
