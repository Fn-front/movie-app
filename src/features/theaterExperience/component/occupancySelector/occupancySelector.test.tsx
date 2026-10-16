/**
 * OccupancySelector テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  OCCUPANCY_OPTIONS,
  OccupancySelector,
  getOccupancyRate,
  type OccupancyLevel,
} from './occupancySelector';

describe('getOccupancyRate', () => {
  it('空席は0、半分は0.5、満席は1を返す', () => {
    expect(getOccupancyRate('empty')).toBe(0);
    expect(getOccupancyRate('half')).toBe(0.5);
    expect(getOccupancyRate('full')).toBe(1);
  });

  it('未知の値は空席（0）として扱う', () => {
    expect(getOccupancyRate('unknown' as OccupancyLevel)).toBe(0);
  });

  it('選択肢の順に占有率が増える', () => {
    const rates = OCCUPANCY_OPTIONS.map((o) => o.rate);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });
});

describe('OccupancySelector', () => {
  it('全ての選択肢をボタンとして表示する', () => {
    render(<OccupancySelector level='empty' onLevelChange={jest.fn()} />);
    for (const option of OCCUPANCY_OPTIONS) {
      expect(
        screen.getByRole('radio', { name: `客席を${option.label}にする` }),
      ).toBeInTheDocument();
    }
  });

  it('現在の選択がボタンの押下状態に反映される', () => {
    render(<OccupancySelector level='half' onLevelChange={jest.fn()} />);
    expect(
      screen.getByRole('radio', { name: '客席を半分にする' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('radio', { name: '客席を満席にする' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('別の選択肢を押すとその値でコールバックされる', async () => {
    const onLevelChange = jest.fn();
    const user = userEvent.setup();
    render(<OccupancySelector level='empty' onLevelChange={onLevelChange} />);

    await user.click(screen.getByRole('radio', { name: '客席を満席にする' }));
    expect(onLevelChange).toHaveBeenCalledWith('full');
  });

  it('選択中の項目を押し直しても未選択にならない（空文字を無視する）', async () => {
    const onLevelChange = jest.fn();
    const user = userEvent.setup();
    render(<OccupancySelector level='full' onLevelChange={onLevelChange} />);

    // Radix は選択解除時に空文字を渡すため、既知の値のときだけ反映する実装になっている
    await user.click(screen.getByRole('radio', { name: '客席を満席にする' }));
    expect(onLevelChange).not.toHaveBeenCalled();
  });

  it('ラベルとグループが関連付けられている（スクリーンリーダー対応）', () => {
    render(<OccupancySelector level='empty' onLevelChange={jest.fn()} />);
    expect(screen.getByText('客席の入り')).toBeInTheDocument();
    // Radix の ToggleGroup.Root は role="group" を出す（項目側が role="radio"）
    expect(screen.getByRole('group', { name: '客席の入り' })).toHaveAttribute(
      'aria-labelledby',
      'occupancy-selector-label',
    );
  });

  it('キーボードで操作できる', async () => {
    const onLevelChange = jest.fn();
    const user = userEvent.setup();
    render(<OccupancySelector level='empty' onLevelChange={onLevelChange} />);

    // ロービングフォーカスで項目間を移動し、Enter で確定する
    await user.tab();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{Enter}');
    expect(onLevelChange).toHaveBeenCalledWith('half');
  });

  it('追加クラス名を適用できる', () => {
    const { container } = render(
      <OccupancySelector
        level='empty'
        onLevelChange={jest.fn()}
        className='extra'
      />,
    );
    expect(container.firstChild).toHaveClass('extra');
  });
});
