import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tabs } from './tabs';

// --- Tests ---

const options = [
  { label: '劇場公開', value: 'theatrical' },
  { label: 'ストリーミング', value: 'streaming' },
] as const;

describe('Tabs', () => {
  it('タブが表示される', () => {
    render(
      <Tabs options={options} value='theatrical' onValueChange={jest.fn()} />,
    );
    expect(screen.getByRole('tab', { name: '劇場公開' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'ストリーミング' }),
    ).toBeInTheDocument();
  });

  it('選択されたタブがaria-selected=trueになる', () => {
    render(
      <Tabs options={options} value='theatrical' onValueChange={jest.fn()} />,
    );
    expect(screen.getByRole('tab', { name: '劇場公開' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'ストリーミング' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('タブクリックでonValueChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(
      <Tabs
        options={options}
        value='theatrical'
        onValueChange={handleChange}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'ストリーミング' }));

    expect(handleChange).toHaveBeenCalledWith('streaming');
  });

  it('disabled状態のタブがクリックできない', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    const optionsWithDisabled = [
      ...options,
      { label: '無効', value: 'disabled', disabled: true },
    ];

    render(
      <Tabs
        options={optionsWithDisabled}
        value='theatrical'
        onValueChange={handleChange}
      />,
    );
    await user.click(screen.getByRole('tab', { name: '無効' }));

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('境界値: 矢印キーで次のタブにフォーカスが移動する（キーボードナビゲーション）', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(
      <Tabs
        options={options}
        value='theatrical'
        onValueChange={handleChange}
      />,
    );

    const firstTab = screen.getByRole('tab', { name: '劇場公開' });
    firstTab.focus();
    expect(firstTab).toHaveFocus();

    // ArrowRight でフォーカスが次タブに移り、選択も切り替わる（Radix Tabs のデフォルト挙動）
    await user.keyboard('{ArrowRight}');
    expect(handleChange).toHaveBeenCalledWith('streaming');
  });

  it('境界値: options が1件のみでも tab が表示される', () => {
    render(
      <Tabs
        options={[{ label: '唯一のタブ', value: 'only' }]}
        value='only'
        onValueChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: '唯一のタブ' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '唯一のタブ' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('aria-labelが設定できる', () => {
    render(
      <Tabs
        options={options}
        value='theatrical'
        onValueChange={jest.fn()}
        aria-label='リリースタイプ'
      />,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-label',
      'リリースタイプ',
    );
  });
});
