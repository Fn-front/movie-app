/**
 * useSeatSelection フック テスト
 */

import { renderHook, act } from '@testing-library/react';

import type { TheaterSeat } from '../types';

import { useSeatSelection } from './useSeatSelection';

const createMockSeat = (id: string): TheaterSeat => ({
  id,
  row_label: 'A',
  seat_number: 1,
  position_x: 0,
  position_y: 0,
  position_z: 5,
  seat_type: 'standard',
});

describe('useSeatSelection', () => {
  it('初期状態ではnull', () => {
    const { result } = renderHook(() => useSeatSelection());
    expect(result.current.selectedSeat).toBeNull();
  });

  it('座席を選択できる', () => {
    const { result } = renderHook(() => useSeatSelection());
    const seat = createMockSeat('seat-1');

    act(() => {
      result.current.selectSeat(seat);
    });

    expect(result.current.selectedSeat).toEqual(seat);
  });

  it('同じ座席をクリックすると選択解除される', () => {
    const { result } = renderHook(() => useSeatSelection());
    const seat = createMockSeat('seat-1');

    act(() => {
      result.current.selectSeat(seat);
    });
    expect(result.current.selectedSeat).toEqual(seat);

    act(() => {
      result.current.selectSeat(seat);
    });
    expect(result.current.selectedSeat).toBeNull();
  });

  it('別の座席を選択すると切り替わる', () => {
    const { result } = renderHook(() => useSeatSelection());
    const seat1 = createMockSeat('seat-1');
    const seat2 = createMockSeat('seat-2');

    act(() => {
      result.current.selectSeat(seat1);
    });
    expect(result.current.selectedSeat?.id).toBe('seat-1');

    act(() => {
      result.current.selectSeat(seat2);
    });
    expect(result.current.selectedSeat?.id).toBe('seat-2');
  });

  it('境界値: 同座席toggleで解除後、もう一度同じ座席を選択できる（toggle2周目）', () => {
    const { result } = renderHook(() => useSeatSelection());
    const seat = createMockSeat('seat-1');

    // 1周目: 選択
    act(() => {
      result.current.selectSeat(seat);
    });
    // 1周目: 解除
    act(() => {
      result.current.selectSeat(seat);
    });
    expect(result.current.selectedSeat).toBeNull();

    // 2周目: 再選択できる
    act(() => {
      result.current.selectSeat(seat);
    });
    expect(result.current.selectedSeat?.id).toBe('seat-1');
  });

  it('境界値: 選択なし状態で clearSelection を呼んでもエラーにならない（no-op）', () => {
    const { result } = renderHook(() => useSeatSelection());

    // 初期状態から clearSelection を呼ぶ
    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedSeat).toBeNull();
  });

  it('clearSelectionで選択を解除できる', () => {
    const { result } = renderHook(() => useSeatSelection());
    const seat = createMockSeat('seat-1');

    act(() => {
      result.current.selectSeat(seat);
    });
    expect(result.current.selectedSeat).not.toBeNull();

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedSeat).toBeNull();
  });
});
