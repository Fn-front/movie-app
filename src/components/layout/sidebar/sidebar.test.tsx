import React from 'react';
import { render, screen } from '@testing-library/react';

import { Sidebar } from './sidebar';

// --- Tests ---

describe('Sidebar', () => {
  it('デフォルトpropsでレンダリングされる', () => {
    render(<Sidebar />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('navigationが表示される', () => {
    render(<Sidebar navigation={<nav>ナビゲーション</nav>} />);
    expect(screen.getByText('ナビゲーション')).toBeInTheDocument();
  });

  it('userSectionが表示される', () => {
    render(<Sidebar userSection={<div>ユーザー情報</div>} />);
    expect(screen.getByText('ユーザー情報')).toBeInTheDocument();
  });

  it('calendarButtonが表示される', () => {
    render(<Sidebar calendarButton={<button>カレンダー</button>} />);
    expect(
      screen.getByRole('button', { name: 'カレンダー' }),
    ).toBeInTheDocument();
  });

  it('watchlistが表示される', () => {
    render(<Sidebar watchlist={<div>映画リスト</div>} />);
    expect(screen.getByText('映画リスト')).toBeInTheDocument();
  });

  it('watchlistがある場合は「見たい映画」見出しが表示される', () => {
    render(<Sidebar watchlist={<div>映画リスト</div>} />);
    expect(
      screen.getByRole('heading', { name: '見たい映画' }),
    ).toBeInTheDocument();
  });

  it('watchlistがない場合は「見たい映画」見出しが表示されない', () => {
    render(<Sidebar />);
    expect(
      screen.queryByRole('heading', { name: '見たい映画' }),
    ).not.toBeInTheDocument();
  });

  it('navigationがない場合はナビゲーション領域が表示されない', () => {
    const { container } = render(<Sidebar />);
    expect(
      container.querySelector('[class*="navigation"]'),
    ).not.toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    render(<Sidebar className='custom' />);
    expect(screen.getByRole('complementary').className).toContain('custom');
  });

  it('すべてのセクションが同時に表示される', () => {
    render(
      <Sidebar
        navigation={<nav>ナビ</nav>}
        userSection={<div>ユーザー</div>}
        calendarButton={<button>カレンダー</button>}
        watchlist={<div>ウォッチリスト</div>}
      />,
    );
    expect(screen.getByText('ナビ')).toBeInTheDocument();
    expect(screen.getByText('ユーザー')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'カレンダー' })).toBeInTheDocument();
    expect(screen.getByText('ウォッチリスト')).toBeInTheDocument();
  });
});
