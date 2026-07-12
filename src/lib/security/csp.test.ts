/**
 * CSP ヘッダ生成ロジックのテスト
 */

import { buildCspHeader } from './csp';

describe('buildCspHeader', () => {
  describe('本番環境（isDev=false）', () => {
    const header = buildCspHeader(false);

    it("script-src に 'self' と 'unsafe-inline' を含む（静的プリレンダ維持）", () => {
      expect(header).toContain("script-src 'self' 'unsafe-inline'");
    });

    it("script-src に nonce / 'strict-dynamic' を含まない", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain('nonce-');
      expect(scriptSrc).not.toContain("'strict-dynamic'");
    });

    it("本番では script-src に 'unsafe-eval' を含まない", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    });

    it("object-src 'none' を含む", () => {
      expect(header).toContain("object-src 'none'");
    });

    it('違反監視用の report-to / report-uri を含む', () => {
      expect(header).toContain('report-to csp-endpoint');
      expect(header).toContain('report-uri /api/csp-report');
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
      expect(header).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('ディレクティブは "; " で連結される', () => {
      expect(header).not.toContain('\n');
      expect(header.split('; ').length).toBeGreaterThan(1);
    });
  });

  describe('開発環境（isDev=true）', () => {
    const header = buildCspHeader(true);

    it("script-src に 'unsafe-eval' を含む（Next.js 開発ツール向け）", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).toContain("'unsafe-eval'");
    });

    it("開発でも 'unsafe-inline' を含む", () => {
      const scriptSrc = header
        .split('; ')
        .find((d) => d.startsWith('script-src'));
      expect(scriptSrc).toContain("'unsafe-inline'");
    });
  });
});
