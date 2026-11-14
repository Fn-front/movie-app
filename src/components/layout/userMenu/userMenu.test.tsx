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
import styles from './userMenu.module.scss';

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

  /**
   * ⚠️ これは「頭文字が**画面に出ている**」ことの検証にはならない。
   *
   * 頭文字は `userMenu.module.scss` の `::before { content: attr(data-initial) }`
   * が描く。jest は `next/jest` で CSS Modules をプロキシに差し替えるため
   * **SCSS は一度も評価されない**。つまりその1ブロックを消しても、ここも tsc も
   * lint も通ったまま画面から頭文字だけが消える。
   *
   * 実際に描かれていることは `e2e/a11y/authenticatedPages.spec.ts` の
   * 「ユーザーメニューの頭文字が `::before` で描かれている」が見ている。
   */
  it('アバター未設定時にイニシャルの元になる属性が付く', () => {
    const { container } = render(<UserMenu />);

    expect(
      container.querySelector('[data-initial]')?.getAttribute('data-initial'),
    ).toBe('テ');
  });

  /**
   * WCAG 2.5.3 Label in Name（axe: label-content-name-mismatch / #1069）
   *
   * トリガーは `aria-label` を持つので、**見えている文字がすべて
   * `aria-label` に含まれていないといけない**。頭文字をテキストノードで
   * 置くと可視テキストが「テテストユーザー」になり違反する。
   *
   * ⚠️ `getByRole('button', { name })` は**アクセシブル名**を見るため、
   * 違反していても通る。可視テキスト側（textContent）を見ること。
   * ⚠️ `aria-hidden='true'` を付けても axe は通らない。このルールは
   * `visibleVirtual(..., screenReader: false)` で画面上の文字を取る。
   */
  it('トリガーの可視テキストは表示名だけで、aria-label に含まれる', () => {
    render(<UserMenu />);

    const trigger = screen.getByRole('button', {
      name: 'テストユーザー ユーザーメニュー',
    });

    expect(trigger.textContent).toBe('テストユーザー');
    // ⚠️ `toContain` は axe の判定の**近似でしかない**。axe は NFKD 正規化 →
    // 括弧内の除去 → 単語分割のうえで「連続する単語列か」を見る。
    // 例えば `ユーザーメニュー（テストユーザー）` はここを通るが axe では落ちる
    // （括弧内が落とされるため）。本当の砦は e2e の axe 検査のほう。
    // 上の textContent アサーションが無いと `toContain('')` で常に真になる点にも注意
    expect(trigger.getAttribute('aria-label')).toContain(trigger.textContent);
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

  /**
   * セッション判定中は、ログイン導線を見せない（#1131）
   *
   * 出してしまうと、ログイン済みの利用者がフルロードするたびに
   * 「ログイン」ボタンが一瞬見える。枠は保ったまま隠し、確定後に
   * 正しいほうを出す
   */
  it('セッション判定中はログイン導線を見せない', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    render(<UserMenu />);

    // jsdom は SCSS を評価しないのでクラスで確認する
    expect(screen.getByRole('button', { name: 'ログイン' })).toHaveClass(
      styles['c_user_menu--resolving'],
    );
  });

  it('セッションが確定したらログイン導線を見せる', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<UserMenu />);

    expect(screen.getByRole('button', { name: 'ログイン' })).not.toHaveClass(
      styles['c_user_menu--resolving'],
    );
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

    it('adminロールのときメニューに「受賞作品の同期」が表示される', async () => {
      mockUseSession.mockReturnValue(sessionWithRole('admin'));
      const user = userEvent.setup();
      render(<UserMenu />);

      await openMenu(user);

      expect(
        screen.getByRole('menuitem', { name: /受賞作品の同期/ }),
      ).toBeInTheDocument();
    });

    it('adminロールで「受賞作品の同期」クリックで/admin/awardsに遷移する', async () => {
      mockUseSession.mockReturnValue(sessionWithRole('admin'));
      const user = userEvent.setup();
      render(<UserMenu />);

      await openMenu(user);
      await user.click(
        screen.getByRole('menuitem', { name: /受賞作品の同期/ }),
      );

      expect(mockPush).toHaveBeenCalledWith('/admin/awards');
    });

    it('一般ユーザーのときは「受賞作品の同期」が表示されない', async () => {
      mockUseSession.mockReturnValue(sessionWithRole('user'));
      const user = userEvent.setup();
      render(<UserMenu />);

      await openMenu(user);

      expect(
        screen.queryByRole('menuitem', { name: /受賞作品の同期/ }),
      ).not.toBeInTheDocument();
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
