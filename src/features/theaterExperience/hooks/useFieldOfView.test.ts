/**
 * useFieldOfView フック テスト
 */

import { renderHook } from '@testing-library/react';

import type { TheaterSeat, Theater } from '../types';

import { useFieldOfView } from './useFieldOfView';

const mockTheater: Theater = {
  id: 'uuid-1',
  name: 'テスト劇場',
  slug: 'test',
  format: 'standard',
  room_width: 20,
  room_depth: 25,
  room_height: 8,
  screen_width: 14,
  screen_height: 6,
  screen_center_x: 0,
  screen_center_y: 4,
  screen_center_z: 12.5,
  audio_layout: 'atmos_9_1_6',
};

const createSeat = (overrides: Partial<TheaterSeat> = {}): TheaterSeat => ({
  id: 'seat-1',
  row_label: 'E',
  seat_number: 8,
  position_x: 0,
  position_y: 0.4,
  position_z: 0,
  seat_type: 'standard',
  ...overrides,
});

describe('useFieldOfView', () => {
  it('座席がnullの場合はnullを返す', () => {
    const { result } = renderHook(() => useFieldOfView(null, mockTheater));
    expect(result.current).toBeNull();
  });

  it('劇場がundefinedの場合はnullを返す', () => {
    const seat = createSeat();
    const { result } = renderHook(() => useFieldOfView(seat, undefined));
    expect(result.current).toBeNull();
  });

  it('中央席の視野メトリクスを計算する', () => {
    const seat = createSeat({ position_x: 0, position_z: 0 });
    const { result } = renderHook(() => useFieldOfView(seat, mockTheater));

    expect(result.current).not.toBeNull();
    expect(result.current!.distance_to_screen).toBeCloseTo(12.5);
    expect(result.current!.distortion_score).toBeCloseTo(0);
    expect(result.current!.horizontal_ratio).toBeGreaterThan(0);
    expect(result.current!.vertical_ratio).toBeGreaterThan(0);
  });

  it('前方席は後方席より占有率が大きい', () => {
    const frontSeat = createSeat({ position_z: 5 });
    const backSeat = createSeat({ position_z: -7 });

    const { result: frontResult } = renderHook(() =>
      useFieldOfView(frontSeat, mockTheater),
    );
    const { result: backResult } = renderHook(() =>
      useFieldOfView(backSeat, mockTheater),
    );

    expect(frontResult.current!.horizontal_ratio).toBeGreaterThan(
      backResult.current!.horizontal_ratio,
    );
  });

  it('端席は中央席より歪みスコアが高い', () => {
    const centerSeat = createSeat({ position_x: 0 });
    const edgeSeat = createSeat({ position_x: 7 });

    const { result: centerResult } = renderHook(() =>
      useFieldOfView(centerSeat, mockTheater),
    );
    const { result: edgeResult } = renderHook(() =>
      useFieldOfView(edgeSeat, mockTheater),
    );

    expect(edgeResult.current!.distortion_score).toBeGreaterThan(
      centerResult.current!.distortion_score,
    );
  });
});
