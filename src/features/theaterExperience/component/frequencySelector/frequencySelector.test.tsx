/**
 * FrequencySelector コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FrequencyBand } from '../../types';

import { FrequencySelector } from './frequencySelector';

describe('FrequencySelector', () => {
  const defaultProps = {
    value: 'mid' as FrequencyBand,
    onValueChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('3つの周波数帯ボタンが表示される', () => {
    render(<FrequencySelector {...defaultProps} />);

    expect(
      screen.getByRole('radio', { name: '低音（80 Hz）' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: '中音（1 kHz）' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: '高音（8 kHz）' }),
    ).toBeInTheDocument();
  });

  it('現在の値が選択状態になる', () => {
    render(<FrequencySelector {...defaultProps} value='low' />);

    const lowButton = screen.getByRole('radio', { name: '低音（80 Hz）' });
    expect(lowButton).toHaveAttribute('data-state', 'on');
  });

  it('別の周波数をクリックするとonValueChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();

    render(
      <FrequencySelector {...defaultProps} onValueChange={onValueChange} />,
    );

    await user.click(screen.getByRole('radio', { name: '高音（8 kHz）' }));

    expect(onValueChange).toHaveBeenCalledWith('high');
  });

  it('ラベルが表示される', () => {
    render(<FrequencySelector {...defaultProps} />);

    expect(screen.getByText('周波数帯')).toBeInTheDocument();
  });

  it('group のaria-labelledbyが設定されている', () => {
    render(<FrequencySelector {...defaultProps} />);

    const group = screen.getByRole('group', { name: '周波数帯' });
    expect(group).toHaveAttribute('aria-labelledby', 'frequency-label');
  });
});
