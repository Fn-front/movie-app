/**
 * 認証ページ共通レイアウトのテスト
 */

import { render, screen } from '@testing-library/react';

import AuthLayout from './layout';

describe('AuthLayout', () => {
  it('childrenが表示される', () => {
    render(<AuthLayout>ログインフォーム</AuthLayout>);
    expect(screen.getByText('ログインフォーム')).toBeInTheDocument();
  });

  it('本文が main ランドマークに包まれる', () => {
    render(<AuthLayout>ログインフォーム</AuthLayout>);
    expect(screen.getByRole('main')).toHaveTextContent('ログインフォーム');
  });
});
