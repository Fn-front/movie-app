/**
 * SeatA11yListコンポーネント
 * スクリーンリーダー・キーボードユーザー向けの座席選択リスト
 */

'use client';

import { memo, useCallback, useMemo, type CSSProperties } from 'react';

import { cn } from '@/utils/cn';

import type { TheaterSeat, Theater, FieldOfViewMetrics } from '../../types';
import { calcFieldOfViewMetrics } from '../../utils/fieldOfView';

import styles from './seatA11yList.module.scss';

export interface SeatA11yListProps {
  /** 座席一覧 */
  seats: TheaterSeat[];
  /** 劇場データ */
  theater: Theater;
  /** 選択中の座席ID */
  selectedSeatId: string | null;
  /** 座席選択コールバック */
  onSelectSeat: (seat: TheaterSeat) => void;
  /** 追加クラス名 */
  className?: string;
}

/** 行ごとに座席をグループ化 */
function groupByRow(seats: TheaterSeat[]): Map<string, TheaterSeat[]> {
  const map = new Map<string, TheaterSeat[]>();
  for (const seat of seats) {
    const group = map.get(seat.row_label) ?? [];
    group.push(seat);
    map.set(seat.row_label, group);
  }
  // 各行を座席番号順にソート
  for (const [, group] of map) {
    group.sort((a, b) => a.seat_number - b.seat_number);
  }
  return map;
}

function formatSeatLabel(
  seat: TheaterSeat,
  metrics: FieldOfViewMetrics | null,
): string {
  const type = seat.seat_type === 'wheelchair' ? '（車椅子席）' : '';
  const base = `${seat.row_label}列${seat.seat_number}番${type}`;
  if (!metrics) return base;
  const dist = metrics.distance_to_screen.toFixed(1);
  const hRatio = (metrics.horizontal_ratio * 100).toFixed(0);
  return `${base}、スクリーン距離${dist}m、視野占有率${hRatio}%`;
}

export const SeatA11yList = memo<SeatA11yListProps>(function SeatA11yList({
  seats,
  theater,
  selectedSeatId,
  onSelectSeat,
  className,
}) {
  const rowGroups = useMemo(() => groupByRow(seats), [seats]);

  // 座席番号で列を揃えるためのグリッド列数（最大席番号）。
  // 台形の特別席帯や欠番があっても列が揃う（縦通路の物理間隔までは再現しない）。
  const maxSeatNumber = useMemo(
    () => seats.reduce((max, s) => Math.max(max, s.seat_number), 0),
    [seats],
  );

  const metricsMap = useMemo(() => {
    const map = new Map<string, FieldOfViewMetrics | null>();
    for (const seat of seats) {
      map.set(
        seat.id,
        calcFieldOfViewMetrics(
          {
            position_x: seat.position_x,
            position_y: seat.position_y,
            position_z: seat.position_z,
          },
          {
            width: theater.screen_width,
            height: theater.screen_height,
            center_x: theater.screen_center_x,
            center_y: theater.screen_center_y,
            center_z: theater.screen_center_z,
          },
        ),
      );
    }
    return map;
  }, [seats, theater]);

  const handleSeatClick = useCallback(
    (seat: TheaterSeat) => {
      onSelectSeat(seat);
    },
    [onSelectSeat],
  );

  return (
    <div
      className={cn(styles.c_seat_a11y_list, className)}
      role='region'
      aria-label='座席選択'
    >
      <div className={styles.c_seat_a11y_list__header}>
        <h2 className={styles.c_seat_a11y_list__title}>座席一覧</h2>
        <span className={styles.c_seat_a11y_list__legend}>
          <span aria-hidden='true'>♿</span>車椅子席
        </span>
      </div>
      {Array.from(rowGroups.entries()).map(([rowLabel, rowSeats]) => (
        <div key={rowLabel} className={styles.c_seat_a11y_list__row}>
          <span className={styles.c_seat_a11y_list__row_label}>
            {rowLabel}列
          </span>
          <ul
            className={styles.c_seat_a11y_list__seats}
            role='list'
            style={{ '--seat-cols': maxSeatNumber } as CSSProperties}
          >
            {rowSeats.map((seat) => {
              const isSelected = seat.id === selectedSeatId;
              const metrics = metricsMap.get(seat.id) ?? null;

              return (
                <li key={seat.id} style={{ gridColumn: seat.seat_number }}>
                  <button
                    type='button'
                    className={cn(
                      styles.c_seat_a11y_list__seat_button,
                      seat.seat_type === 'wheelchair' &&
                        styles.c_seat_a11y_list__seat_button__wheelchair,
                      isSelected &&
                        styles.c_seat_a11y_list__seat_button__selected,
                    )}
                    aria-pressed={isSelected}
                    aria-label={formatSeatLabel(seat, metrics)}
                    title={formatSeatLabel(seat, metrics)}
                    onClick={() => handleSeatClick(seat)}
                  >
                    {seat.seat_type === 'wheelchair' ? (
                      <span aria-hidden='true'>♿</span>
                    ) : (
                      seat.seat_number
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
});

SeatA11yList.displayName = 'SeatA11yList';
