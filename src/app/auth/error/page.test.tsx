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

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it.each([
    ['コードが無い', {}],
    ['知らないコード', { error: 'SomethingNew' }],
    ['空文字', { error: '' }],
  ])('%s なら既定の文言に倒す', async (_label, params) => {
    // Auth.js の内部エラー種別は30以上あり、将来増えうる。
    // 知らない値で落としたり空白を出したりしない
    await renderPage(params);

    expect(
      screen.getByText(AUTH_PAGE_ERROR_MESSAGES.DEFAULT),
    ).toBeInTheDocument();
  });

  /**
   * ⚠️ `Object.prototype` のキーを踏ませない
   *
   * `code in AUTH_PAGE_ERROR_MESSAGES` で判定すると、`toString` で関数が、
   * `__proto__` でオブジェクトが返り、React が描画ごと落ちる。`?error=` の
   * 値はそのまま渡るので URL だけで誰でも踏める。404 を直した代わりに
   * クラッシュを埋めることになる
   */
  it.each([
    ['toString'],
    ['constructor'],
    ['valueOf'],
    ['hasOwnProperty'],
    ['__proto__'],
  ])('error=%s でも落ちず既定の文言を出す', async (code) => {
    await renderPage({ error: code });

    expect(
      screen.getByText(AUTH_PAGE_ERROR_MESSAGES.DEFAULT),
    ).toBeInTheDocument();
  });

  it('配列なら既定に倒す（文字列化して拾わない）', async () => {
    // ⚠️ `['Configuration', 'AccessDenied']` だと、ガードを外しても
    // 文字列化で `"Configuration,AccessDenied"` になりどのキーにも当たらず、
    // **ガードの有無を区別できない**。要素1つにすると、ガードが無いときだけ
    // `"Configuration"` に当たって通ってしまう
    await renderPage({ error: ['Configuration'] });

    expect(
      screen.getByText(AUTH_PAGE_ERROR_MESSAGES.DEFAULT),
    ).toBeInTheDocument();
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
      screen.getByRole('heading', {
        name: 'ログインできませんでした',
        level: 1,
      }),
    ).toBeInTheDocument();
  });

  it('エラーの種類がURLに載るため検索エンジンに拾わせない', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
