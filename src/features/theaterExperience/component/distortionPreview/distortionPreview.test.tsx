/**
 * DistortionPreview コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import type { TheaterSeat, Theater } from '../../types';

import { DistortionPreview } from './distortionPreview';

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

const mockSeat: TheaterSeat = {
  id: 'seat-1',
  row_label: 'E',
  seat_number: 8,
  position_x: 0,
  position_y: 0.4,
  position_z: 0,
  seat_type: 'standard',
};

// Canvas 2D context のモック
const mockGetContext = jest.fn().mockReturnValue({
  clearRect: jest.fn(),
  strokeRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  setLineDash: jest.fn(),
  set strokeStyle(_: string) {},
  set fillStyle(_: string) {},
  set lineWidth(_: number) {},
});

beforeEach(() => {
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(mockGetContext);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DistortionPreview', () => {
  it('ラベルが表示される', () => {
    render(<DistortionPreview seat={mockSeat} theater={mockTheater} />);

    expect(screen.getByText('スクリーンの見え方')).toBeInTheDocument();
  });

  it('canvasがレンダリングされる', () => {
    render(<DistortionPreview seat={mockSeat} theater={mockTheater} />);

    const canvas = screen.getByRole('img', {
      name: 'スクリーン歪みプレビュー',
    });
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('Canvas 2Dコンテキストの描画関数が呼ばれる', () => {
    render(<DistortionPreview seat={mockSeat} theater={mockTheater} />);

    const ctx = mockGetContext.mock.results[0]?.value;
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
