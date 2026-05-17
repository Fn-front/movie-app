/**
 * TheaterSelector コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import type { TheaterListItem } from '../../types';

import { TheaterSelector } from './theaterSelector';

const mockTheaters: TheaterListItem[] = [
  {
    id: 'uuid-1',
    name: 'スタンダードシアター（中型）',
    slug: 'standard-medium',
    format: 'standard',
    audio_layout: 'atmos_9_1_6',
  },
  {
    id: 'uuid-2',
    name: 'IMAXシアター',
    slug: 'imax',
    format: 'imax',
    audio_layout: 'atmos_9_1_6',
  },
];

describe('TheaterSelector', () => {
  const defaultProps = {
    theaters: mockTheaters,
    value: 'standard-medium',
    onValueChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('劇場ラベルが表示される', () => {
    render(<TheaterSelector {...defaultProps} />);

    expect(screen.getByText('劇場')).toBeInTheDocument();
  });

  it('Select要素がレンダリングされる', () => {
    render(<TheaterSelector {...defaultProps} />);

    // Radix UI Select の trigger ボタンが存在する
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
  });

  it('現在の値が表示される', () => {
    render(<TheaterSelector {...defaultProps} />);

    expect(
      screen.getByText('スタンダードシアター（中型）'),
    ).toBeInTheDocument();
  });
});
