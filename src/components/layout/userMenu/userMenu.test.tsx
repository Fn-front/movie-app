const mockPush = jest.fn();
const mockSignOut = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UserMenu } from './userMenu';

// --- Tests ---

const defaultProps = {
  userName: 'テストユーザー',
  userEmail: 'test@example.com',
  userImage: null,
};

describe('UserMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ユーザー名が表示される', () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByText('テストユーザー')).toBeInTheDocument();
  });

  it('アバター未設定時にイニシャルが表示される', () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByText('テ')).toBeInTheDocument();
  });

  it('アバター画像が設定されている場合にimg要素が表示される', () => {
    render(
      <UserMenu
        {...defaultProps}
        userImage="https://example.com/avatar.png"
      />,
    );
    expect(screen.getByAltText('テストユーザー')).toBeInTheDocument();
  });

  it('トリガーボタンにアクセシブルなラベルがある', () => {
    render(<UserMenu {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: 'ユーザーメニューを開く' }),
    ).toBeInTheDocument();
  });

  it('クリックでポップオーバーが表示される', async () => {
    const user = userEvent.setup();
    render(<UserMenu {...defaultProps} />);

    await user.click(
      screen.getByRole('button', { name: 'ユーザーメニューを開く' }),
    );

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /設定/ })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /ログアウト/ }),
    ).toBeInTheDocument();
  });

  it('「設定」クリックで/settingsに遷移する', async () => {
    const user = userEvent.setup();
    render(<UserMenu {...defaultProps} />);

    await user.click(
      screen.getByRole('button', { name: 'ユーザーメニューを開く' }),
    );
    await user.click(screen.getByRole('menuitem', { name: /設定/ }));

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('「ログアウト」クリックでsignOutが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<UserMenu {...defaultProps} />);

    await user.click(
      screen.getByRole('button', { name: 'ユーザーメニューを開く' }),
    );
    await user.click(screen.getByRole('menuitem', { name: /ログアウト/ }));

    expect(mockSignOut).toHaveBeenCalledWith({
      callbackUrl: '/auth/signin',
    });
  });
});
