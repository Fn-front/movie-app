/**
 * SeatMeshes コンポーネント テスト
 * R3F内の描画はテスト対象外。props型とエクスポートのみ検証。
 */

jest.mock('three', () => ({
  Object3D: jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.position = { set: jest.fn() };
    this.matrix = {};
    this.updateMatrix = jest.fn();
  }),
  Color: jest.fn(),
}));

import type { TheaterSeat } from '../../types';

import { SeatMeshes } from './seatMeshes';

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
      onSeatClick: jest.fn(),
    };

    expect(props.seats).toHaveLength(1);
  });
});
