/**
 * 座席選択管理フック
 */

import { useCallback, useMemo, useState } from 'react';

import type { TheaterSeat } from '../types';

export interface UseSeatSelectionReturn {
  /** 現在選択中の座席（未選択時はnull） */
  selectedSeat: TheaterSeat | null;
  /** 座席を選択する */
  selectSeat: (seat: TheaterSeat) => void;
  /** 座席選択を解除する */
  clearSelection: () => void;
}

export function useSeatSelection(): UseSeatSelectionReturn {
  const [selectedSeat, setSelectedSeat] = useState<TheaterSeat | null>(null);

  const selectSeat = useCallback(
    (seat: TheaterSeat) => {
      // 同じ座席をクリックした場合は選択解除
      if (selectedSeat?.id === seat.id) {
        setSelectedSeat(null);
      } else {
        setSelectedSeat(seat);
      }
    },
    [selectedSeat?.id],
  );

  const clearSelection = useCallback(() => {
    setSelectedSeat(null);
  }, []);

  return useMemo(
    () => ({
      selectedSeat,
      selectSeat,
      clearSelection,
    }),
    [selectedSeat, selectSeat, clearSelection],
  );
}
