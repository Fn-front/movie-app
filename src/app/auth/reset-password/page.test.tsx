/**
 * パスワード再設定ページのテスト
 *
 * フォームをモックせず、**クエリから実際の表示まで**を通して見る。
 * 片側だけを固定すると、受け渡しの取り違え（プロップ名の変更・渡し忘れ）を
 * どちらのテストも検出できない。
 */

import { render, screen } from '@testing-library/react';

import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';

import ResetPasswordPage, { metadata } from './page';

// フォームが `useRouter` を使う（再設定成功後にログイン画面へ送る）
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// フォームは成功時に同意レコードを片付ける（#1234）。その実体は
// `next-auth/react`（ESM）を引き込むため、素のままだと jest が解析できない
jest.mock('@/lib/auth/logout', () => ({
  cleanUpBeforeSignOut: jest.fn(),
}));

/** `searchParams` は Promise で渡る */
const renderPage = async (params: Record<string, string | string[]>) =>
  render(await ResetPasswordPage({ searchParams: Promise.resolve(params) }));

describe('ResetPasswordPage', () => {
  it('トークンがあればフォームを出す', async () => {
    await renderPage({ token: 'plain-token' });

    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
  });

  it('トークンが配列ならフォームを出さない', async () => {
    // `?token=a&token=b` のような重複指定は不正として扱う
    await renderPage({ token: ['a', 'b'] });

    expect(screen.queryByLabelText('新しいパスワード')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      PASSWORD_RESET_MESSAGES.TOKEN_MISSING,
    );
  });

  describe('admin 発行経由の印があるとき', () => {
    it('再送リンクを出さず、発行元の管理者へ案内する', async () => {
      // 発行アカウントの宛先は受信できない合成アドレス。再送を押しても
      // 列挙防止で「送信しました」が返るだけで何も届かない
      await renderPage({ token: 'plain-token', issued: '1' });

      expect(
        screen.queryByRole('link', { name: '再設定リンクを再送する' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_RESEND),
      ).toBeInTheDocument();
    });

    it.each([
      ['印が無い', {}],
      ['値が違う', { issued: 'yes' }],
      ['空文字', { issued: '' }],
      ['配列', { issued: ['1', '1'] }],
    ])('%s なら従来どおり再送リンクを出す', async (_label, extra) => {
      await renderPage({ token: 'plain-token', ...extra });

      expect(
        screen.getByRole('link', { name: '再設定リンクを再送する' }),
      ).toHaveAttribute('href', '/auth/forgot-password');
      expect(
        screen.queryByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_RESEND),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * ログインに使うアカウント名（#1237）
   *
   * `issued` と同じ扱いをする。片方だけ緩いと、渡し忘れや不正な形を
   * どちらのテストも検出できない
   */
  describe('アカウント名', () => {
    it('渡されていれば表示する', async () => {
      await renderPage({ token: 'plain-token', account: 'GQTDXC4QHWC3' });

      expect(screen.getByText('GQTDXC4QHWC3')).toBeInTheDocument();
    });

    it.each([
      ['無い', {}],
      ['空文字', { account: '' }],
      ['配列', { account: ['GQTDXC4QHWC3', 'OTHER'] }],
    ])('%s なら出さない', async (_label, extra) => {
      await renderPage({ token: 'plain-token', ...extra });

      expect(
        screen.queryByText(PASSWORD_RESET_MESSAGES.ACCOUNT_NAME_LABEL),
      ).not.toBeInTheDocument();
    });
  });

  it('トークンがURLに載るため検索エンジンに拾わせない', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
