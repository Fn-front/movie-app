/**
 * ログインページのテスト
 *
 * クエリをどう `SignInContent` へ渡すかを見る。表示は各フォームの
 * テストが受け持つ
 */

import { render, screen } from '@testing-library/react';

import SignInPage, { metadata } from './page';

jest.mock('@/features/auth/signInContent/signInContent', () => ({
  SignInContent: ({
    callbackUrl,
    initialIdentifier,
  }: {
    callbackUrl?: string;
    initialIdentifier?: string;
  }) => (
    <div
      data-testid='signin-content'
      data-callback-url={callbackUrl ?? ''}
      data-initial-identifier={initialIdentifier ?? ''}
    />
  ),
}));

const renderPage = async (params: Record<string, string | string[]>) => {
  render(await SignInPage({ searchParams: Promise.resolve(params) }));
  return screen.getByTestId('signin-content');
};

describe('SignInPage', () => {
  it('callbackUrl を渡す', async () => {
    const content = await renderPage({ callbackUrl: '/watchlist' });

    expect(content).toHaveAttribute('data-callback-url', '/watchlist');
  });

  it('callbackUrl が配列なら渡さない', async () => {
    // 重複指定は不正として扱い、ホームへフォールバックさせる
    const content = await renderPage({ callbackUrl: ['/a', '/b'] });

    expect(content).toHaveAttribute('data-callback-url', '');
  });

  /**
   * パスワード設定の完了画面から渡ってくるアカウント名（#1237）
   *
   * 発行アカウントの利用者はここで自分のメールアドレスを入れて失敗
   * しがちで、実際に起きている。値が分かっているなら入れておく
   */
  describe('アカウント名', () => {
    it('渡されていればそのまま通す', async () => {
      const content = await renderPage({ account: 'GQTDXC4QHWC3' });

      expect(content).toHaveAttribute(
        'data-initial-identifier',
        'GQTDXC4QHWC3',
      );
    });

    it.each([
      ['無い', {}],
      ['空文字', { account: '' }],
      ['配列', { account: ['GQTDXC4QHWC3', 'OTHER'] }],
    ])('%s なら通さない', async (_label, params) => {
      const content = await renderPage(params);

      expect(content).toHaveAttribute('data-initial-identifier', '');
    });
  });

  it('メタデータを持つ', () => {
    expect(metadata.title).toBe('ログイン | Movie App');
    expect(metadata.description).toBeTruthy();
  });
});
