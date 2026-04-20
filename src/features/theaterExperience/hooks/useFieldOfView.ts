/**
 * 視野占有率計算フック
 */

import { useMemo } from 'react';

import type { TheaterSeat, Theater, FieldOfViewMetrics } from '../types';
import { calcFieldOfViewMetrics } from '../utils/fieldOfView';

/**
 * 選択座席と劇場データから視野メトリクスを算出する
 *
 * @param seat 選択中の座席（nullの場合はnullを返す）
 * @param theater 劇場データ（undefinedの場合はnullを返す）
 * @returns 視野占有率メトリクス
 */
export function useFieldOfView(
  seat: TheaterSeat | null,
  theater: Theater | undefined,
): FieldOfViewMetrics | null {
  return useMemo(() => {
    if (!seat || !theater) return null;

    return calcFieldOfViewMetrics(
      { position_x: seat.position_x, position_z: seat.position_z },
      {
        width: theater.screen_width,
        height: theater.screen_height,
        center_x: theater.screen_center_x,
        center_z: theater.screen_center_z,
      },
    );
  }, [seat, theater]);
}
