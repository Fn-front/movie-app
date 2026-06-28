/**
 * resolveSafeCallbackUrl のテスト
 */

import { resolveSafeCallbackUrl } from './url';

describe('resolveSafeCallbackUrl', () => {
  it('未指定（null/undefined/空）の場合はホームを返す', () => {
    expect(resolveSafeCallbackUrl(null)).toBe('/');
    expect(resolveSafeCallbackUrl(undefined)).toBe('/');
    expect(resolveSafeCallbackUrl('')).toBe('/');
  });

  it('配列（クエリ重複指定）が渡された場合はホームを返す', () => {
    expect(resolveSafeCallbackUrl(['/watchlist', '/favorites'])).toBe('/');
  });

  it('同一オリジンの相対パスはそのまま返す', () => {
    expect(resolveSafeCallbackUrl('/watchlist')).toBe('/watchlist');
    expect(resolveSafeCallbackUrl('/favorites?sort=desc')).toBe(
      '/favorites?sort=desc',
    );
  });

  it('外部URLはホームを返す', () => {
    expect(resolveSafeCallbackUrl('https://evil.com')).toBe('/');
    expect(resolveSafeCallbackUrl('http://evil.com/path')).toBe('/');
  });

  it('プロトコル相対URL（//）はホームを返す', () => {
    expect(resolveSafeCallbackUrl('//evil.com')).toBe('/');
  });

  it('バックスラッシュを含むパスはホームを返す', () => {
    expect(resolveSafeCallbackUrl('/\\evil.com')).toBe('/');
  });

  it("'/' で始まらないパスはホームを返す", () => {
    expect(resolveSafeCallbackUrl('watchlist')).toBe('/');
    expect(resolveSafeCallbackUrl('javascript:alert(1)')).toBe('/');
  });

  it('認証ページ自身はループ防止のためホームを返す', () => {
    expect(resolveSafeCallbackUrl('/auth/signin')).toBe('/');
    expect(resolveSafeCallbackUrl('/auth/signup?x=1')).toBe('/');
  });
});
