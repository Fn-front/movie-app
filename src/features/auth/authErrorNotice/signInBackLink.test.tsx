import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { SignInBackLink } from './signInBackLink';

const KEY = 'auth:pendingCallbackUrl';

describe('SignInBackLink', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('預かり分が無ければログイン画面へ戻るだけ', () => {
    render(<SignInBackLink />);

    expect(
      screen.getByRole('link', { name: 'ログイン画面へ戻る' }),
    ).toHaveAttribute('href', '/auth/signin');
  });

  it('預かっていた戻り先をクエリに載せる（#1246）', async () => {
    // アプリ自身が拒んだソーシャルログインは /auth/error へ来る。
    // ここで載せ替えないと、ログイン画面に ?error= が付かず
    // SignInContent は預かり分を採らない
    window.sessionStorage.setItem(KEY, '/watchlist');

    render(<SignInBackLink />);

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'ログイン画面へ戻る' }),
      ).toHaveAttribute('href', '/auth/signin?callbackUrl=%2Fwatchlist'),
    );
  });

  it('載せ替えたら sessionStorage から消す', async () => {
    window.sessionStorage.setItem(KEY, '/watchlist');

    render(<SignInBackLink />);

    await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull());
  });

  it('サーバー描画の href は預かり分に左右されない', () => {
    // href は DOM に出るので、サーバーの出力とクライアントの初回描画が
    // 食い違うとハイドレーションがずれる。effect は走らないため、
    // storage に何が入っていても既定値のままになる
    window.sessionStorage.setItem(KEY, '/watchlist');

    const html = renderToString(<SignInBackLink />);

    expect(html).toContain('href="/auth/signin"');
    expect(html).not.toContain('callbackUrl');
  });

  it.each([['https://evil.com'], ['//evil.com'], ['/auth/signin']])(
    '%s は載せない（オープンリダイレクト対策）',
    async (unsafe) => {
      // 預ける側でも弾いているが、sessionStorage は同一オリジンの
      // スクリプトなら誰でも書ける
      window.sessionStorage.setItem(KEY, unsafe);

      render(<SignInBackLink />);

      await waitFor(() =>
        expect(window.sessionStorage.getItem(KEY)).toBeNull(),
      );
      expect(
        screen.getByRole('link', { name: 'ログイン画面へ戻る' }),
      ).toHaveAttribute('href', '/auth/signin');
    },
  );

  it('クラス名を渡せる', () => {
    render(<SignInBackLink className='cta' />);

    expect(
      screen.getByRole('link', { name: 'ログイン画面へ戻る' }),
    ).toHaveClass('cta');
  });
});
