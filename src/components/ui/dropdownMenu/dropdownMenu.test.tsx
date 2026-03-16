import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { DropdownMenu } from './dropdownMenu';

// --- Tests ---

describe('DropdownMenu', () => {
  const defaultItems = [
    { label: 'プロフィール', onClick: jest.fn() },
    { label: '設定', onClick: jest.fn() },
    { label: 'ログアウト', onClick: jest.fn(), destructive: true },
  ];

  beforeEach(() => {
    defaultItems.forEach((item) => (item.onClick as jest.Mock).mockClear());
  });

  it('デフォルトpropsでトリガーがレンダリングされる', () => {
    render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );
    expect(
      screen.getByRole('button', { name: 'メニュー' }),
    ).toBeInTheDocument();
  });

  it('トリガーをクリックするとメニューが表示される', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    expect(
      screen.getByRole('menuitem', { name: 'プロフィール' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '設定' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'ログアウト' }),
    ).toBeInTheDocument();
  });

  it('メニューアイテムをクリックするとonClickが呼ばれる', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    await user.click(screen.getByRole('menuitem', { name: 'プロフィール' }));
    expect(defaultItems[0].onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled状態のアイテムが無効になる', async () => {
    const user = userEvent.setup();
    const items = [
      { label: '有効', onClick: jest.fn() },
      { label: '無効', onClick: jest.fn(), disabled: true },
    ];
    render(<DropdownMenu trigger={<button>メニュー</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    const disabledItem = screen.getByRole('menuitem', { name: '無効' });
    expect(disabledItem).toHaveAttribute('data-disabled', '');
  });

  it('アイコン付きのアイテムが表示される', async () => {
    const user = userEvent.setup();
    const items = [
      {
        label: 'アイコン付き',
        onClick: jest.fn(),
        icon: <span data-testid='menu-icon'>icon</span>,
      },
    ];
    render(<DropdownMenu trigger={<button>メニュー</button>} items={items} />);
    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    expect(screen.getByTestId('menu-icon')).toBeInTheDocument();
  });

  it('メニューが閉じた状態ではアイテムが表示されない', () => {
    render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('アクセシビリティ違反がない（閉じた状態）', async () => {
    const { container } = render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('アクセシビリティ違反がない（開いた状態）', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );
    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('矢印キーでメニューアイテム間を移動できる', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );

    // メニューを開く
    await user.click(screen.getByRole('button', { name: 'メニュー' }));

    // 下矢印キーでアイテム間を移動
    await user.keyboard('{ArrowDown}');
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(items[2]).toHaveFocus();
  });

  it('Escapeキーでメニューが閉じる', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>メニュー</button>} items={defaultItems} />,
    );

    await user.click(screen.getByRole('button', { name: 'メニュー' }));
    expect(
      screen.getByRole('menuitem', { name: 'プロフィール' }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});
