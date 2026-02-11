/**
 * SideNavコンポーネントのテスト
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { SideNav } from './sideNav';

// next/navigationのモック
const mockPathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('SideNav', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
  });

  it('ナビゲーションリンクが表示される', () => {
    render(<SideNav />);

    expect(screen.getByText('公開予定')).toBeInTheDocument();
    expect(screen.getByText('公開中')).toBeInTheDocument();
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
  });
});
