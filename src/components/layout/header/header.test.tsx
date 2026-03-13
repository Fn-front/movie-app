import { render, screen } from '@testing-library/react';

import { Header } from './header';

// --- Tests ---

describe('Header', () => {
  it('デフォルトのロゴテキストが表示される', () => {
    render(<Header />);
    expect(screen.getByText('Movie App')).toBeInTheDocument();
  });

  it('カスタムロゴテキストが表示される', () => {
    render(<Header logoText='カスタムアプリ' />);
    expect(screen.getByText('カスタムアプリ')).toBeInTheDocument();
  });

  it('ロゴがリンクになっている', () => {
    render(<Header />);
    const link = screen.getByRole('link', { name: 'Movie App' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('カスタムロゴリンク先が設定できる', () => {
    render(<Header logoHref='/custom' />);
    const link = screen.getByRole('link', { name: 'Movie App' });
    expect(link).toHaveAttribute('href', '/custom');
  });

  it('headerバナーロールが存在する', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('searchBarスロットが表示される', () => {
    render(<Header searchBar={<input placeholder='検索' />} />);
    expect(screen.getByPlaceholderText('検索')).toBeInTheDocument();
  });

  it('userMenuスロットが表示される', () => {
    render(<Header userMenu={<button>ユーザー</button>} />);
    expect(
      screen.getByRole('button', { name: 'ユーザー' }),
    ).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    render(<Header className='custom' />);
    expect(screen.getByRole('banner').className).toContain('custom');
  });

  it('mobileMenuButtonスロットが表示される', () => {
    render(
      <Header
        mobileMenuButton={<button>メニューを開く</button>}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'メニューを開く' }),
    ).toBeInTheDocument();
  });

  it('mobileMenuButtonが未指定の場合は表示されない', () => {
    render(<Header />);
    expect(
      screen.queryByRole('button', { name: 'メニューを開く' }),
    ).not.toBeInTheDocument();
  });
});
