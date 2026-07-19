/**
 * SeatA11yList コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TheaterSeat, Theater } from '../../types';

import { SeatA11yList } from './seatA11yList';
import styles from './seatA11yList.module.scss';

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

const mockSeats: TheaterSeat[] = [
  {
    id: 'seat-a1',
    row_label: 'A',
    seat_number: 1,
    position_x: -3,
    position_y: 0,
    position_z: 5,
    seat_type: 'standard',
  },
  {
    id: 'seat-a2',
    row_label: 'A',
    seat_number: 2,
    position_x: 0,
    position_y: 0,
    position_z: 5,
    seat_type: 'standard',
  },
  {
    id: 'seat-b1',
    row_label: 'B',
    seat_number: 1,
    position_x: -3,
    position_y: 0.1,
    position_z: 3.7,
    seat_type: 'standard',
  },
];

describe('SeatA11yList', () => {
  const defaultProps = {
    seats: mockSeats,
    theater: mockTheater,
    selectedSeatId: null,
    hoveredSeatId: null,
    onSelectSeat: jest.fn(),
    onHoverSeat: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('行ラベルが表示される', () => {
    render(<SeatA11yList {...defaultProps} />);

    expect(screen.getByText('A列')).toBeInTheDocument();
    expect(screen.getByText('B列')).toBeInTheDocument();
  });

  it('座席ボタンが表示される', () => {
    render(<SeatA11yList {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('座席ボタンにaria-labelが設定される', () => {
    render(<SeatA11yList {...defaultProps} />);

    const button = screen.getAllByRole('button')[0];
    expect(button).toHaveAttribute('aria-label');
    expect(button.getAttribute('aria-label')).toContain('A列1番');
  });

  it('選択中の座席はaria-pressed=trueになる', () => {
    render(<SeatA11yList {...defaultProps} selectedSeatId='seat-a2' />);

    const buttons = screen.getAllByRole('button');
    // A列2番が選択されている
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    // その他は未選択
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'false');
  });

  it('座席クリックでonSelectSeatが呼ばれる', async () => {
    const user = userEvent.setup();
    const onSelectSeat = jest.fn();

    render(<SeatA11yList {...defaultProps} onSelectSeat={onSelectSeat} />);

    await user.click(screen.getAllByRole('button')[0]);

    expect(onSelectSeat).toHaveBeenCalledWith(mockSeats[0]);
  });

  it('region roleとaria-labelが設定される', () => {
    render(<SeatA11yList {...defaultProps} />);

    expect(
      screen.getByRole('region', { name: '座席選択' }),
    ).toBeInTheDocument();
  });

  it('座席番号でグリッド列に配置される（飛び番でも実列に揃う）', () => {
    const seats: TheaterSeat[] = [
      {
        id: 'gap-5',
        row_label: 'A',
        seat_number: 5,
        position_x: 0,
        position_y: 0,
        position_z: 0,
        seat_type: 'standard',
      },
    ];
    render(<SeatA11yList {...defaultProps} seats={seats} />);

    const li = screen.getByRole('button').closest('li');
    expect(li).toHaveStyle({ gridColumn: '5' });
    // グリッド列数は最大席番号
    const ul = li?.parentElement as HTMLElement;
    expect(ul.style.getPropertyValue('--seat-cols')).toBe('5');
  });

  it('ホバーで onHoverSeat が席IDで呼ばれ、解除で null が渡る（3Dと相互連動）', async () => {
    const user = userEvent.setup();
    const onHoverSeat = jest.fn();

    render(<SeatA11yList {...defaultProps} onHoverSeat={onHoverSeat} />);

    const button = screen.getAllByRole('button')[0];
    await user.hover(button);
    expect(onHoverSeat).toHaveBeenCalledWith('seat-a1');

    await user.unhover(button);
    expect(onHoverSeat).toHaveBeenCalledWith(null);
  });

  it('フォーカスでも onHoverSeat が呼ばれる（キーボード連動）', async () => {
    const user = userEvent.setup();
    const onHoverSeat = jest.fn();

    render(<SeatA11yList {...defaultProps} onHoverSeat={onHoverSeat} />);

    await user.tab();
    expect(screen.getAllByRole('button')[0]).toHaveFocus();
    expect(onHoverSeat).toHaveBeenCalledWith('seat-a1');
  });

  it('hoveredSeatId が指す席に強調クラスが付く', () => {
    render(<SeatA11yList {...defaultProps} hoveredSeatId='seat-a2' />);

    const buttons = screen.getAllByRole('button');
    // A列2番がホバー強調される
    expect(buttons[1]).toHaveClass(
      styles.c_seat_a11y_list__seat_button__hovered,
    );
    // その他は強調されない
    expect(buttons[0]).not.toHaveClass(
      styles.c_seat_a11y_list__seat_button__hovered,
    );
  });

  it('車椅子席は♿マーカーと車椅子席ラベルが付く', () => {
    const seats: TheaterSeat[] = [
      {
        id: 'wc',
        row_label: 'A',
        seat_number: 1,
        position_x: 0,
        position_y: 0,
        position_z: 0,
        seat_type: 'wheelchair',
      },
    ];
    render(<SeatA11yList {...defaultProps} seats={seats} />);

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toContain('車椅子席');
    // 席番号を主表示に残しつつ ♿ マーカーも併記する（番号が読める）
    expect(button).toHaveTextContent('1');
    expect(button).toHaveTextContent('♿');
  });
});
