import React from 'react';
import { render, screen } from '@testing-library/react';

import { EmptyState } from './emptyState';

// --- Tests ---

describe('EmptyState', () => {
  it('デフォルトpropsでレンダリングされる', () => {
    render(<EmptyState title='データがありません' />);
    expect(
      screen.getByRole('heading', { name: 'データがありません' }),
    ).toBeInTheDocument();
  });

  it('タイトルが表示される', () => {
    render(<EmptyState title='検索結果が見つかりませんでした' />);
    expect(
      screen.getByRole('heading', { name: '検索結果が見つかりませんでした' }),
    ).toBeInTheDocument();
  });

  it('説明が表示される', () => {
    render(
      <EmptyState
        title='データがありません'
        description='別のキーワードで検索してみてください'
      />,
    );
    expect(
      screen.getByText('別のキーワードで検索してみてください'),
    ).toBeInTheDocument();
  });

  it('descriptionが未指定の場合は説明が表示されない', () => {
    render(<EmptyState title='データがありません' />);
    const heading = screen.getByRole('heading');
    // heading以外にpタグがないことを確認
    expect(heading.parentElement?.querySelectorAll('p').length).toBe(0);
  });

  it('アイコンが表示される', () => {
    render(
      <EmptyState
        title='データがありません'
        icon={<span data-testid='test-icon'>icon</span>}
      />,
    );
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('アクションが表示される', () => {
    render(
      <EmptyState
        title='データがありません'
        action={<button>リセット</button>}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'リセット' }),
    ).toBeInTheDocument();
  });

  it('iconが未指定の場合はアイコン領域が表示されない', () => {
    const { container } = render(<EmptyState title='データがありません' />);
    expect(container.querySelector('[class*="icon"]')).not.toBeInTheDocument();
  });

  it('actionが未指定の場合はアクション領域が表示されない', () => {
    const { container } = render(<EmptyState title='データがありません' />);
    expect(container.querySelector('[class*="action"]')).not.toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    const { container } = render(
      <EmptyState title='データがありません' className='custom' />,
    );
    expect(container.firstChild).toHaveClass('custom');
  });
});
