/**
 * SeatInfoPanel コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import type { TheaterSeat, FieldOfViewMetrics } from '../../types';

import { SeatInfoPanel } from './seatInfoPanel';

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

const createMetrics = (
  overrides: Partial<FieldOfViewMetrics> = {},
): FieldOfViewMetrics => ({
  horizontal_ratio: 0.35,
  vertical_ratio: 0.2,
  distance_to_screen: 12.5,
  distortion_score: 0.1,
  ...overrides,
});

describe('SeatInfoPanel', () => {
  it('座席未選択時はプレースホルダーを表示', () => {
    render(<SeatInfoPanel seat={null} fovMetrics={null} />);

    expect(screen.getByText('座席を選択してください')).toBeInTheDocument();
  });

  it('座席選択時に座席番号を表示', () => {
    const seat = createSeat({ row_label: 'E', seat_number: 8 });
    const metrics = createMetrics();

    render(<SeatInfoPanel seat={seat} fovMetrics={metrics} />);

    expect(screen.getByText('E列 8番')).toBeInTheDocument();
  });

  it('視野メトリクスを表示', () => {
    const seat = createSeat();
    const metrics = createMetrics({
      distance_to_screen: 12.5,
      horizontal_ratio: 0.35,
      vertical_ratio: 0.2,
      distortion_score: 0.1,
    });

    render(<SeatInfoPanel seat={seat} fovMetrics={metrics} />);

    expect(screen.getByText('12.5 m')).toBeInTheDocument();
    expect(screen.getByText('35.0%')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('歪みが低く占有率が高い場合は「最適」バッジ', () => {
    const seat = createSeat();
    const metrics = createMetrics({
      distortion_score: 0.05,
      horizontal_ratio: 0.4,
    });

    render(<SeatInfoPanel seat={seat} fovMetrics={metrics} />);

    expect(screen.getByText('最適')).toBeInTheDocument();
  });

  it('歪みが中程度の場合は「良好」バッジ', () => {
    const seat = createSeat();
    const metrics = createMetrics({
      distortion_score: 0.2,
      horizontal_ratio: 0.25,
    });

    render(<SeatInfoPanel seat={seat} fovMetrics={metrics} />);

    expect(screen.getByText('良好')).toBeInTheDocument();
  });

  it('歪みが高い場合は「普通」バッジ', () => {
    const seat = createSeat();
    const metrics = createMetrics({
      distortion_score: 0.4,
      horizontal_ratio: 0.15,
    });

    render(<SeatInfoPanel seat={seat} fovMetrics={metrics} />);

    expect(screen.getByText('普通')).toBeInTheDocument();
  });

  it('歪みが非常に高い場合は「非推奨」バッジ', () => {
    const seat = createSeat();
    const metrics = createMetrics({
      distortion_score: 0.6,
      horizontal_ratio: 0.1,
    });

    render(<SeatInfoPanel seat={seat} fovMetrics={metrics} />);

    expect(screen.getByText('非推奨')).toBeInTheDocument();
  });

  it('aria-live="polite"が設定されている', () => {
    const seat = createSeat();
    const metrics = createMetrics();

    render(<SeatInfoPanel seat={seat} fovMetrics={metrics} />);

    const region = screen.getByRole('region', { name: '座席情報' });
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});
