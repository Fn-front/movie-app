/**
 * ログインページのテスト
 *
 * クエリをどう `SignInContent` へ渡すかを見る。表示は各フォームの
 * テストが受け持つ
 */

import { render, screen } from '@testing-library/react';

import { SIGN_IN_PAGE_ERROR_MESSAGES } from '@/constants/auth';

import SignInPage, { metadata } from './page';

jest.mock('@/features/auth/signInContent/signInContent', () => ({
  SignInContent: ({
    callbackUrl,
    initialIdentifier,
    initialError,
  }: {
    callbackUrl?: string;
    initialIdentifier?: string;
    initialError?: string;
  }) => (
    <div
      data-testid='signin-content'
      data-callback-url={callbackUrl ?? ''}
      data-initial-identifier={initialIdentifier ?? ''}
      data-initial-error={initialError ?? ''}
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

  /**
   * ソーシャルログインの失敗（#1242）
   *
   * Auth.js は `kind = 'signIn'` のエラーをここへ戻す。読んでいなかった
   * ため「押したのに何も起きずログイン画面に戻された」ように見えていた
   */
  describe('エラーコード', () => {
    it.each([
      ['OAuthAccountNotLinked'],
      ['AccountNotLinked'],
      ['OAuthCallbackError'],
      ['MissingCSRF'],
      ['CredentialsSignin'],
      ['Configuration'],
    ] as const)('%s に対応する文言を渡す', async (code) => {
      const content = await renderPage({ error: code });

      expect(content).toHaveAttribute(
        'data-initial-error',
        SIGN_IN_PAGE_ERROR_MESSAGES[code],
      );
    });

    it('別のプロバイダで登録済みであることが分かる', async () => {
      // これが伝わらないと何度押しても同じ所に戻される。
      // プロバイダの認証を通過した＝そのアドレスの持ち主なので列挙にならない
      const content = await renderPage({ error: 'OAuthAccountNotLinked' });

      expect(content.getAttribute('data-initial-error')).toContain(
        '別の方法で登録されています',
      );
    });

    it('error が無ければ何も渡さない', async () => {
      const content = await renderPage({});

      expect(content).toHaveAttribute('data-initial-error', '');
    });

    /**
     * ⚠️ `in` や素の添字参照で引くと `Object.prototype` まで辿り、
     * `__proto__` でオブジェクトが、`toString` で関数が返って描画が落ちる。
     * `?error=` は URL に書くだけで誰でも踏める（#1240 で実際に踏んだ）
     */
    it.each([
      ['知らないコード', 'SomethingNew'],
      ['プロトタイプのキー', '__proto__'],
      ['プロトタイプのメソッド', 'toString'],
      ['constructor', 'constructor'],
      ['空文字', ''],
      // ⚠️ 要素1つの配列にする。2要素だと String() で
      // 'OAuthCallbackError,MissingCSRF' になり、**配列を弾かなくても**
      // キーに当たらず DEFAULT が返る。それでは何も検証していない。
      // 1要素なら 'OAuthCallbackError' と等しくなり、ガードが無いと通る
      // （#1240 で同じ形のテストが素通りしていた）
      ['配列', ['OAuthCallbackError']],
      ['複数指定の配列', ['OAuthCallbackError', 'MissingCSRF']],
    ])('%s は既定の文言に倒す', async (_label, error) => {
      const content = await renderPage({ error });

      expect(content).toHaveAttribute(
        'data-initial-error',
        SIGN_IN_PAGE_ERROR_MESSAGES.DEFAULT,
      );
    });

    it('DEFAULT を狙って指定しても落ちない', async () => {
      // DEFAULT 自体は自前のキーなので hasOwnProperty を通る。
      // 既定と同じ文言になるだけで、利用者に見える害は無い
      const content = await renderPage({ error: 'DEFAULT' });

      expect(content).toHaveAttribute(
        'data-initial-error',
        SIGN_IN_PAGE_ERROR_MESSAGES.DEFAULT,
      );
    });
  });

  it('メタデータを持つ', () => {
    expect(metadata.title).toBe('ログイン | Movie App');
    expect(metadata.description).toBeTruthy();
  });
});
