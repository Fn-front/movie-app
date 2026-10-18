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
      <Tabs options={options} value='theatrical' onValueChange={jest.fn()}>
        <p>パネル</p>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: '劇場公開' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'ストリーミング' }),
    ).toBeInTheDocument();
  });

  it('選択されたタブがaria-selected=trueになる', () => {
    render(
      <Tabs options={options} value='theatrical' onValueChange={jest.fn()}>
        <p>パネル</p>
      </Tabs>,
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
      <Tabs options={options} value='theatrical' onValueChange={handleChange}>
        <p>パネル</p>
      </Tabs>,
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
      >
        <p>パネル</p>
      </Tabs>,
    );
    await user.click(screen.getByRole('tab', { name: '無効' }));

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('境界値: 矢印キーで次のタブにフォーカスが移動する（キーボードナビゲーション）', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(
      <Tabs options={options} value='theatrical' onValueChange={handleChange}>
        <p>パネル</p>
      </Tabs>,
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
      >
        <p>パネル</p>
      </Tabs>,
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
      >
        <p>パネル</p>
      </Tabs>,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-label',
      'リリースタイプ',
    );
  });

  describe('タブパネル（アクセシビリティ）', () => {
    it('children が tabpanel として描画される', () => {
      render(
        <Tabs options={options} value='theatrical' onValueChange={jest.fn()}>
          <p>劇場公開のコンテンツ</p>
        </Tabs>,
      );

      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveTextContent('劇場公開のコンテンツ');
    });

    it('選択中タブの aria-controls が実在する tabpanel を指す', () => {
      render(
        <Tabs options={options} value='theatrical' onValueChange={jest.fn()}>
          <p>パネル</p>
        </Tabs>,
      );

      const selectedTab = screen.getByRole('tab', { name: '劇場公開' });
      const controls = selectedTab.getAttribute('aria-controls');

      expect(controls).toBeTruthy();
      expect(document.getElementById(controls as string)).toBe(
        screen.getByRole('tabpanel'),
      );
    });

    it('tabpanel が選択中タブに aria-labelledby で紐づく', () => {
      render(
        <Tabs options={options} value='theatrical' onValueChange={jest.fn()}>
          <p>パネル</p>
        </Tabs>,
      );

      const selectedTab = screen.getByRole('tab', { name: '劇場公開' });
      const panel = screen.getByRole('tabpanel');

      expect(panel).toHaveAttribute('aria-labelledby', selectedTab.id);
    });

    it('value を切り替えると tabpanel も選択中タブに追従する', () => {
      const { rerender } = render(
        <Tabs options={options} value='theatrical' onValueChange={jest.fn()}>
          <p>パネル</p>
        </Tabs>,
      );

      rerender(
        <Tabs options={options} value='streaming' onValueChange={jest.fn()}>
          <p>パネル</p>
        </Tabs>,
      );

      const selectedTab = screen.getByRole('tab', { name: 'ストリーミング' });
      const panel = screen.getByRole('tabpanel');

      expect(selectedTab).toHaveAttribute('aria-selected', 'true');
      expect(selectedTab.getAttribute('aria-controls')).toBe(panel.id);
    });

    it('contentClassName が tabpanel に適用される', () => {
      render(
        <Tabs
          options={options}
          value='theatrical'
          onValueChange={jest.fn()}
          contentClassName='custom-panel'
        >
          <p>パネル</p>
        </Tabs>,
      );

      expect(screen.getByRole('tabpanel')).toHaveClass('custom-panel');
    });
  });
});
