/**
 * CSP ヘッダ生成ロジックのテスト
 */

import { buildCspHeader, generateNonce } from './csp';

describe('generateNonce', () => {
  it('base64 文字列を返す', () => {
    const nonce = generateNonce();
    // base64 として復元できることを確認
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(nonce.length).toBeGreaterThan(0);
  });

  it('呼び出しごとに異なる値を生成する', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });

  it('復元すると UUID 形式になる', () => {
    const nonce = generateNonce();
    const decoded = Buffer.from(nonce, 'base64').toString('utf8');
    expect(decoded).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('buildCspHeader', () => {
  const nonce = 'test-nonce-value';

  describe('本番環境（isDev=false）', () => {
    const header = buildCspHeader(nonce, false);

    it("script-src に nonce と 'strict-dynamic' を含む", () => {
      expect(header).toContain(
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      );
    });

    it("script-src から 'unsafe-inline' が除去されている", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("本番では script-src に 'unsafe-eval' を含まない", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    });

    it('既存の他ディレクティブを維持する', () => {
      expect(header).toContain("default-src 'self'");
      expect(header).toContain("frame-ancestors 'none'");
      expect(header).toContain("base-uri 'self'");
      expect(header).toContain("form-action 'self'");
      expect(header).toContain('frame-src https://www.youtube.com');
      expect(header).toContain("connect-src 'self' https://*.supabase.co");
      expect(header).toContain(
        "img-src 'self' https://image.tmdb.org data: blob:",
      );
      expect(header).toContain("font-src 'self' data:");
      // style-src は今回のスコープ外のため 'unsafe-inline' を維持
      expect(header).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('ディレクティブは "; " で連結される', () => {
      expect(header).not.toContain('\n');
      expect(header.split('; ').length).toBeGreaterThan(1);
    });
  });

  describe('開発環境（isDev=true）', () => {
    const header = buildCspHeader(nonce, true);

    it("script-src に 'unsafe-eval' を含む（Next.js 開発ツール向け）", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).toContain("'unsafe-eval'");
    });

    it("開発でも 'unsafe-inline' は含まない", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });
  });

  it('nonce の値がヘッダに反映される', () => {
    const header = buildCspHeader('another-nonce', false);
    expect(header).toContain("'nonce-another-nonce'");
  });
});
