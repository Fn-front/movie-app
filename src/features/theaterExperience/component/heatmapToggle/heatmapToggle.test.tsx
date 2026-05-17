/**
 * HeatmapToggle コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HeatmapToggle } from './heatmapToggle';

describe('HeatmapToggle', () => {
  const defaultProps = {
    visible: false,
    onVisibleChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('「表示」「非表示」の2つの選択肢が表示される', () => {
    render(<HeatmapToggle {...defaultProps} />);

    expect(
      screen.getByRole('radio', { name: 'ヒートマップを表示' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'ヒートマップを非表示' }),
    ).toBeInTheDocument();
  });

  it('visible=false のとき「非表示」が選択状態になる', () => {
    render(<HeatmapToggle {...defaultProps} visible={false} />);

    expect(
      screen.getByRole('radio', { name: 'ヒートマップを非表示' }),
    ).toHaveAttribute('data-state', 'on');
  });

  it('visible=true のとき「表示」が選択状態になる', () => {
    render(<HeatmapToggle {...defaultProps} visible={true} />);

    expect(
      screen.getByRole('radio', { name: 'ヒートマップを表示' }),
    ).toHaveAttribute('data-state', 'on');
  });

  it('「表示」をクリックすると onVisibleChange(true) が呼ばれる', async () => {
    const onVisibleChange = jest.fn();
    const user = userEvent.setup();
    render(
      <HeatmapToggle
        {...defaultProps}
        visible={false}
        onVisibleChange={onVisibleChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'ヒートマップを表示' }));

    expect(onVisibleChange).toHaveBeenCalledWith(true);
  });

  it('「非表示」をクリックすると onVisibleChange(false) が呼ばれる', async () => {
    const onVisibleChange = jest.fn();
    const user = userEvent.setup();
    render(
      <HeatmapToggle
        {...defaultProps}
        visible={true}
        onVisibleChange={onVisibleChange}
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'ヒートマップを非表示' }),
    );

    expect(onVisibleChange).toHaveBeenCalledWith(false);
  });

  it('ラベルが表示される', () => {
    render(<HeatmapToggle {...defaultProps} />);

    expect(screen.getByText('音響ヒートマップ')).toBeInTheDocument();
  });

  it('group の aria-labelledby が設定されている', () => {
    render(<HeatmapToggle {...defaultProps} />);

    const group = screen.getByRole('group', { name: '音響ヒートマップ' });
    expect(group).toHaveAttribute('aria-labelledby', 'heatmap-toggle-label');
  });
});
