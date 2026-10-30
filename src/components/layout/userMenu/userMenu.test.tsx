const mockPush = jest.fn();
const mockSignOut = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockUseSession = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const mockToggleTheme = jest.fn();
const mockTheme = { resolved: 'light' as 'light' | 'dark' };
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    resolvedTheme: mockTheme.resolved,
    setTheme: jest.fn(),
    toggleTheme: mockToggleTheme,
    mounted: true,
  }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UserMenu } from './userMenu';

// --- Tests ---

const authenticatedSession = {
  data: {
    user: {
      id: 'user-123',
      name: 'テストユーザー',
      email: 'test@example.com',
      image: null,
    },
  },
  status: 'authenticated',
};

/** ロールを差し替えた認証済みセッションを作る */
const sessionWithRole = (role: string) => ({
  ...authenticatedSession,
  data: {
    user: { ...authenticatedSession.data.user, role },
  },
});

describe('UserMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue(authenticatedSession);
    mockTheme.resolved = 'light';
  });

  it('ユーザー名が表示される', () => {
    render(<UserMenu />);
    expect(screen.getByText('テストユーザー')).toBeInTheDocument();
  });

  it('アバター未設定時にイニシャルが表示される', () => {
    render(<UserMenu />);
    expect(screen.getByText('テ')).toBeInTheDocument();
  });

  it('アバター画像が設定されている場合にimg要素が表示される', () => {
    mockUseSession.mockReturnValue({
      ...authenticatedSession,
      data: {
        user: {
          ...authenticatedSession.data.user,
          image: 'https://example.com/avatar.png',
        },
      },
    });
    render(<UserMenu />);
    expect(screen.getByAltText('テストユーザー')).toBeInTheDocument();
  });

  it('トリガーボタンにアクセシブルなラベルがある', () => {
    render(<UserMenu />);
    expect(
      screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
    ).toBeInTheDocument();
  });

  it('未認証時はログインボタンが表示される', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    render(<UserMenu />);
    expect(
      screen.getByRole('button', { name: 'ログイン' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ログイン')).toBeInTheDocument();
  });

  it('未認証時のログインボタンクリックで/auth/signinに遷移する', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    render(<UserMenu />);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(mockPush).toHaveBeenCalledWith('/auth/signin');
  });

  it('クリックでポップオーバーが表示される', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(
      screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
    );

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /設定/ })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /ログアウト/ }),
    ).toBeInTheDocument();
  });

  it('「設定」クリックで/settingsに遷移する', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(
      screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
    );
    await user.click(screen.getByRole('menuitem', { name: /設定/ }));

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('「ログアウト」クリックでsignOutが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(
      screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
    );
    await user.click(screen.getByRole('menuitem', { name: /ログアウト/ }));

    expect(mockSignOut).toHaveBeenCalledWith({
      callbackUrl: '/auth/signin',
    });
  });

  it('メニューにダークモードのトグル（menuitemcheckbox）が表示される', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(
      screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
    );

    const toggle = screen.getByRole('menuitemcheckbox', {
      name: /ダークモード/,
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('ダークテーマ時はトグルがオン（aria-checked=true）', async () => {
    mockTheme.resolved = 'dark';
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(
      screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
    );

    expect(
      screen.getByRole('menuitemcheckbox', { name: /ダークモード/ }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('ダークモードのトグルクリックでtoggleThemeが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(
      screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
    );
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: /ダークモード/ }),
    );

    expect(mockToggleTheme).toHaveBeenCalled();
  });

  describe('アカウント管理の導線', () => {
    const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(
        screen.getByRole('button', { name: 'テストユーザー ユーザーメニュー' }),
      );
    };

    it('adminロールのときメニューに「アカウント管理」が表示される', async () => {
      mockUseSession.mockReturnValue(sessionWithRole('admin'));
      const user = userEvent.setup();
      render(<UserMenu />);

      await openMenu(user);

      expect(
        screen.getByRole('menuitem', { name: /アカウント管理/ }),
      ).toBeInTheDocument();
    });

    it('adminロールで「アカウント管理」クリックで/admin/accountsに遷移する', async () => {
      mockUseSession.mockReturnValue(sessionWithRole('admin'));
      const user = userEvent.setup();
      render(<UserMenu />);

      await openMenu(user);
      await user.click(
        screen.getByRole('menuitem', { name: /アカウント管理/ }),
      );

      expect(mockPush).toHaveBeenCalledWith('/admin/accounts');
    });

    it('一般ユーザーのときは「アカウント管理」が表示されない', async () => {
      mockUseSession.mockReturnValue(sessionWithRole('user'));
      const user = userEvent.setup();
      render(<UserMenu />);

      await openMenu(user);

      expect(
        screen.getByRole('menuitem', { name: /設定/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('menuitem', { name: /アカウント管理/ }),
      ).not.toBeInTheDocument();
    });

    it('ロール未設定のセッションでは「アカウント管理」が表示されない', async () => {
      const user = userEvent.setup();
      render(<UserMenu />);

      await openMenu(user);

      expect(
        screen.queryByRole('menuitem', { name: /アカウント管理/ }),
      ).not.toBeInTheDocument();
    });

    it('未認証のときは「アカウント管理」が表示されない', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });
      render(<UserMenu />);

      expect(screen.queryByText('アカウント管理')).not.toBeInTheDocument();
    });
  });
});
