/**
 * SideNavコンポーネントのテスト
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SideNav } from './sideNav';

// next/navigationのモック
const mockPathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

// next-auth のモック（useNavAuthGuard が使用）
let mockAuthStatus = 'unauthenticated';
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: mockAuthStatus }),
}));

// ログイン誘導ストアのモック
const mockOpenLoginPrompt = jest.fn();
jest.mock('@/lib/store/useLoginPromptStore', () => ({
  useLoginPromptStore: (selector: (s: { open: jest.Mock }) => unknown) =>
    selector({ open: mockOpenLoginPrompt }),
}));

describe('SideNav', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue('/');
    mockAuthStatus = 'unauthenticated';
  });

  it('ナビゲーションリンクが表示される', () => {
    render(<SideNav />);

    expect(screen.getByText('公開予定')).toBeInTheDocument();
    expect(screen.getByText('公開中')).toBeInTheDocument();
    expect(screen.getByText('お気に入り')).toBeInTheDocument();
  });

  it('nav要素にaria-labelが設定される', () => {
    render(<SideNav />);

    expect(
      screen.getByRole('navigation', { name: '映画ナビゲーション' }),
    ).toBeInTheDocument();
  });

  it('公開予定がアクティブの場合aria-current="page"が設定される', () => {
    mockPathname.mockReturnValue('/movies/upcoming');
    render(<SideNav />);

    const upcomingLink = screen.getByText('公開予定');
    expect(upcomingLink).toHaveAttribute('aria-current', 'page');

    const nowShowingLink = screen.getByText('公開中');
    expect(nowShowingLink).not.toHaveAttribute('aria-current');
  });

  it('公開中がアクティブの場合aria-current="page"が設定される', () => {
    mockPathname.mockReturnValue('/movies/now-showing');
    render(<SideNav />);

    const upcomingLink = screen.getByText('公開予定');
    expect(upcomingLink).not.toHaveAttribute('aria-current');

    const nowShowingLink = screen.getByText('公開中');
    expect(nowShowingLink).toHaveAttribute('aria-current', 'page');
  });

  it('どちらもアクティブでない場合aria-currentが設定されない', () => {
    mockPathname.mockReturnValue('/');
    render(<SideNav />);

    const upcomingLink = screen.getByText('公開予定');
    expect(upcomingLink).not.toHaveAttribute('aria-current');

    const nowShowingLink = screen.getByText('公開中');
    expect(nowShowingLink).not.toHaveAttribute('aria-current');
  });

  it('リンクに正しいhrefが設定される', () => {
    render(<SideNav />);

    const upcomingLink = screen.getByText('公開予定');
    expect(upcomingLink).toHaveAttribute('href', '/movies/upcoming');

    const nowShowingLink = screen.getByText('公開中');
    expect(nowShowingLink).toHaveAttribute('href', '/movies/now-showing');

    const favoritesLink = screen.getByText('お気に入り');
    expect(favoritesLink).toHaveAttribute('href', '/favorites');
  });

  it('お気に入りがアクティブの場合aria-current="page"が設定される', () => {
    mockPathname.mockReturnValue('/favorites');
    render(<SideNav />);

    const favoritesLink = screen.getByText('お気に入り');
    expect(favoritesLink).toHaveAttribute('aria-current', 'page');

    const upcomingLink = screen.getByText('公開予定');
    expect(upcomingLink).not.toHaveAttribute('aria-current');
  });

  it('未認証で保護ルート(お気に入り)クリックでログイン誘導が表示される', async () => {
    const user = userEvent.setup();
    render(<SideNav />);

    await user.click(screen.getByText('お気に入り'));

    expect(mockOpenLoginPrompt).toHaveBeenCalledWith(
      'お気に入りを見るにはログインが必要です。',
    );
  });
});
