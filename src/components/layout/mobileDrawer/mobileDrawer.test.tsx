import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MobileDrawer } from './mobileDrawer';

const mockPush = jest.fn();
let mockPathname = '/';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

// useSession / signOut のモック
const mockSignOut = jest.fn();
let mockSessionData: {
  data: {
    user: { name: string; email: string; image: string | null };
    expires: string;
  } | null;
  status: string;
} = {
  data: {
    user: {
      name: 'テストユーザー',
      email: 'test@example.com',
      image: null,
    },
    expires: '2099-12-31',
  },
  status: 'authenticated',
};

jest.mock('next-auth/react', () => ({
  useSession: () => mockSessionData,
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

describe('MobileDrawer', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
    mockSessionData = {
      data: {
        user: {
          name: 'テストユーザー',
          email: 'test@example.com',
          image: null,
        },
        expires: '2099-12-31',
      },
      status: 'authenticated',
    };
  });

  it('開いた状態でDrawerが表示される', () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByText('メニュー')).toBeInTheDocument();
  });

  it('閉じた状態ではDrawerが表示されない', () => {
    render(<MobileDrawer {...defaultProps} open={false} />);
    expect(screen.queryByText('メニュー')).not.toBeInTheDocument();
  });

  it('ナビゲーションリンクが表示される', () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByText('ホーム')).toBeInTheDocument();
    expect(screen.getByText('公開予定')).toBeInTheDocument();
    expect(screen.getByText('公開中')).toBeInTheDocument();
    expect(screen.getByText('お気に入り')).toBeInTheDocument();
    expect(screen.getByText('ウォッチリスト')).toBeInTheDocument();
  });

  it('現在のページのリンクにaria-current="page"が設定される', () => {
    mockPathname = '/favorites';
    render(<MobileDrawer {...defaultProps} />);
    const favLink = screen.getByText('お気に入り').closest('a');
    expect(favLink).toHaveAttribute('aria-current', 'page');
  });

  it('アクティブでないページにはaria-currentが設定されない', () => {
    mockPathname = '/favorites';
    render(<MobileDrawer {...defaultProps} />);
    const homeLink = screen.getByText('ホーム').closest('a');
    expect(homeLink).not.toHaveAttribute('aria-current');
  });

  it('ユーザー情報が表示される', () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByText('テストユーザー')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('イニシャルアバターが表示される（画像なしの場合）', () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByText('テ')).toBeInTheDocument();
  });

  it('ユーザー画像がある場合はアバター画像が表示される', () => {
    mockSessionData = {
      data: {
        user: {
          name: 'テストユーザー',
          email: 'test@example.com',
          image: 'https://example.com/avatar.jpg',
        },
        expires: '2099-12-31',
      },
      status: 'authenticated',
    };
    render(<MobileDrawer {...defaultProps} />);
    const avatar = screen.getByAltText('テストユーザー');
    expect(avatar).toBeInTheDocument();
  });

  it('未認証の場合はユーザーセクションが表示されない', () => {
    mockSessionData = {
      data: null,
      status: 'unauthenticated',
    };
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.queryByText('テストユーザー')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /設定/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /ログアウト/ }),
    ).not.toBeInTheDocument();
  });

  it('未認証の場合はログインボタンが表示される', () => {
    mockSessionData = {
      data: null,
      status: 'unauthenticated',
    };
    render(<MobileDrawer {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /ログイン/ }),
    ).toBeInTheDocument();
  });

  it('認証済みの場合はログインボタンが表示されない', () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(
      screen.queryByRole('button', { name: /ログイン/ }),
    ).not.toBeInTheDocument();
  });

  it('ログインボタンクリックでサインインページに遷移する', async () => {
    mockSessionData = {
      data: null,
      status: 'unauthenticated',
    };
    const user = userEvent.setup();
    render(<MobileDrawer {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /ログイン/ }));
    expect(mockPush).toHaveBeenCalledWith('/auth/signin');
  });

  it('設定ボタンクリックで設定ページに遷移する', async () => {
    const user = userEvent.setup();
    render(<MobileDrawer {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /設定/ }));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('ログアウトボタンクリックでsignOutが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<MobileDrawer {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /ログアウト/ }));
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/auth/signin' });
  });

  it('閉じるボタンでDrawerが閉じる', async () => {
    const onOpenChange = jest.fn();
    const user = userEvent.setup();
    render(<MobileDrawer {...defaultProps} onOpenChange={onOpenChange} />);
    const closeButton = screen.getByRole('button', { name: '閉じる' });
    await user.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('モバイルナビゲーションのaria-labelが設定されている', () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(
      screen.getByRole('navigation', { name: 'モバイルナビゲーション' }),
    ).toBeInTheDocument();
  });
});
