/**
 * ログインエラーページのテスト
 *
 * クエリから実際の表示までを通して見る。片側だけを固定すると、
 * 受け渡しの取り違えをどちらのテストも検出できない
 */

import { render, screen } from '@testing-library/react';

import { AUTH_PAGE_ERROR_MESSAGES } from '@/constants/auth';

import AuthErrorPage, { metadata } from './page';

const renderPage = async (params: Record<string, string | string[]>) =>
  render(await AuthErrorPage({ searchParams: Promise.resolve(params) }));

describe('AuthErrorPage', () => {
  it.each([
    ['Configuration', AUTH_PAGE_ERROR_MESSAGES.Configuration],
    ['AccessDenied', AUTH_PAGE_ERROR_MESSAGES.AccessDenied],
    ['Verification', AUTH_PAGE_ERROR_MESSAGES.Verification],
  ])('error=%s に対応する文言を出す', async (code, message) => {
    await renderPage({ error: code });

    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it.each([
    ['コードが無い', {}],
    ['知らないコード', { error: 'SomethingNew' }],
    ['配列', { error: ['Configuration', 'AccessDenied'] }],
    ['空文字', { error: '' }],
  ])('%s なら既定の文言に倒す', async (_label, params) => {
    // Auth.js の内部エラー種別は30以上あり、将来増えうる。
    // 知らない値で落としたり空白を出したりしない
    await renderPage(params);

    expect(screen.getByRole('alert')).toHaveTextContent(
      AUTH_PAGE_ERROR_MESSAGES.DEFAULT,
    );
  });

  it('ログイン画面へ戻る導線を出す', async () => {
    // 行き止まりにしない。ここへ飛ばされた人は他に手段が無い
    await renderPage({ error: 'AccessDenied' });

    expect(
      screen.getByRole('link', { name: 'ログイン画面へ戻る' }),
    ).toHaveAttribute('href', '/auth/signin');
  });

  it('見出しを出す', async () => {
    await renderPage({ error: 'AccessDenied' });

    expect(
      screen.getByRole('heading', { name: 'ログインできませんでした' }),
    ).toBeInTheDocument();
  });

  it('エラーの種類がURLに載るため検索エンジンに拾わせない', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
