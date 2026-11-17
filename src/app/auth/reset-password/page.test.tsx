/**
 * パスワード再設定ページのテスト
 *
 * クエリをどうフォームへ渡すかだけを見る。表示は
 * `resetPasswordForm.test.tsx` が受け持つ。
 */

import { render, screen } from '@testing-library/react';

import ResetPasswordPage, { metadata } from './page';

jest.mock('@/features/auth/resetPasswordForm/resetPasswordForm', () => ({
  ResetPasswordForm: ({
    token,
    isIssuedAccount,
  }: {
    token?: string;
    isIssuedAccount?: boolean;
  }) => (
    <div
      data-testid='reset-password-form'
      data-token={token ?? ''}
      data-issued={String(Boolean(isIssuedAccount))}
    />
  ),
}));

/** `searchParams` は Promise で渡る */
const searchParams = (params: Record<string, string | string[]>) =>
  Promise.resolve(params);

const renderPage = async (params: Record<string, string | string[]>) => {
  render(await ResetPasswordPage({ searchParams: searchParams(params) }));
  return screen.getByTestId('reset-password-form');
};

describe('ResetPasswordPage', () => {
  it('トークンをフォームへ渡す', async () => {
    const form = await renderPage({ token: 'plain-token' });

    expect(form).toHaveAttribute('data-token', 'plain-token');
  });

  it('トークンが配列なら渡さない', async () => {
    // `?token=a&token=b` のような重複指定は不正として扱う
    const form = await renderPage({ token: ['a', 'b'] });

    expect(form).toHaveAttribute('data-token', '');
  });

  describe('発行アカウントの印', () => {
    it('印があれば発行経由として渡す', async () => {
      const form = await renderPage({ token: 'plain-token', issued: '1' });

      expect(form).toHaveAttribute('data-issued', 'true');
    });

    it('印が無ければ通常の利用者として渡す', async () => {
      const form = await renderPage({ token: 'plain-token' });

      expect(form).toHaveAttribute('data-issued', 'false');
    });

    it('印の値が違えば通常の利用者として渡す', async () => {
      const form = await renderPage({ token: 'plain-token', issued: 'yes' });

      expect(form).toHaveAttribute('data-issued', 'false');
    });

    it('印が配列なら通常の利用者として渡す', async () => {
      const form = await renderPage({
        token: 'plain-token',
        issued: ['1', '1'],
      });

      expect(form).toHaveAttribute('data-issued', 'false');
    });
  });

  it('トークンがURLに載るため検索エンジンに拾わせない', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
