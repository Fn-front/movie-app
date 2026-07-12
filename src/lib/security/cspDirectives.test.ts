/**
 * CSP ディレクティブ共有モジュール（単一ソース）のテスト
 */

import {
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  TRUSTED_TYPES_POLICIES,
  buildCspHeaderValue,
  buildReportingEndpointsValue,
  buildTrustedTypesReportOnlyHeaderValue,
  getCspDirectives,
  getTrustedTypesReportOnlyDirectives,
} from './cspDirectives.mjs';

describe('getCspDirectives', () => {
  it('デフォルト（引数なし）は本番相当・レポートなし', () => {
    const directives = getCspDirectives();
    const scriptSrc = directives.find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline'");
    expect(directives.some((d) => d.startsWith('report-to'))).toBe(false);
    expect(directives.some((d) => d.startsWith('report-uri'))).toBe(false);
  });

  it("isDev=true で script-src に 'unsafe-eval' を付与する", () => {
    const directives = getCspDirectives({ isDev: true });
    const scriptSrc = directives.find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("isDev=false で 'unsafe-eval' を付与しない", () => {
    const directives = getCspDirectives({ isDev: false });
    const scriptSrc = directives.find((d) => d.startsWith('script-src'));
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('withReporting=true で report-to / report-uri を末尾に付与する', () => {
    const directives = getCspDirectives({ withReporting: true });
    expect(directives).toContain(`report-to ${CSP_REPORT_GROUP}`);
    expect(directives).toContain(`report-uri ${CSP_REPORT_PATH}`);
  });

  it('既存の主要ディレクティブを維持する', () => {
    const directives = getCspDirectives();
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
    expect(directives).toContain(
      "img-src 'self' https://image.tmdb.org data: blob:",
    );
    expect(directives).toContain("font-src 'self' data:");
    expect(directives).toContain("connect-src 'self' https://*.supabase.co");
    expect(directives).toContain('frame-src https://www.youtube.com');
    expect(directives).toContain("frame-ancestors 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("form-action 'self'");
    expect(directives).toContain("object-src 'none'");
  });
});

describe('buildCspHeaderValue', () => {
  it('ディレクティブを "; " で 1 行連結する', () => {
    const header = buildCspHeaderValue({ isDev: false, withReporting: true });
    expect(header).not.toContain('\n');
    expect(header).toContain("default-src 'self'; ");
    expect(header).toContain('report-uri /api/csp-report');
  });

  it('引数なしでも動作する（デフォルト適用）', () => {
    const header = buildCspHeaderValue();
    expect(header).toContain("default-src 'self'");
    expect(header).not.toContain('report-to');
  });
});

describe('buildReportingEndpointsValue', () => {
  it('report-to グループ名と受信 URL を対応づける', () => {
    expect(buildReportingEndpointsValue()).toBe(
      `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
    );
  });
});

describe('TRUSTED_TYPES_POLICIES', () => {
  it('sanitize-html / theme-init を許可リストに含む', () => {
    expect(TRUSTED_TYPES_POLICIES).toContain('sanitize-html');
    expect(TRUSTED_TYPES_POLICIES).toContain('theme-init');
  });

  it('DOMPurify / Next.js の内部ポリシー名も許可する', () => {
    expect(TRUSTED_TYPES_POLICIES).toContain('dompurify');
    expect(TRUSTED_TYPES_POLICIES).toContain('nextjs');
  });

  it('凍結（不変）されている', () => {
    expect(Object.isFrozen(TRUSTED_TYPES_POLICIES)).toBe(true);
  });
});

describe('getTrustedTypesReportOnlyDirectives（段階3）', () => {
  const directives = getTrustedTypesReportOnlyDirectives();

  it("require-trusted-types-for 'script' を含む", () => {
    expect(directives).toContain("require-trusted-types-for 'script'");
  });

  it('trusted-types に許可ポリシー名を列挙する', () => {
    expect(directives).toContain(
      `trusted-types ${TRUSTED_TYPES_POLICIES.join(' ')}`,
    );
  });

  it('既存の /api/csp-report へ違反を送る（report-to / report-uri）', () => {
    expect(directives).toContain(`report-to ${CSP_REPORT_GROUP}`);
    expect(directives).toContain(`report-uri ${CSP_REPORT_PATH}`);
  });

  it('enforce CSP には trusted-types 系を混ぜない（Report-Only 専用）', () => {
    const enforce = getCspDirectives({ withReporting: true });
    expect(enforce.some((d) => d.startsWith('require-trusted-types-for'))).toBe(
      false,
    );
    expect(enforce.some((d) => d.startsWith('trusted-types'))).toBe(false);
  });
});

describe('buildTrustedTypesReportOnlyHeaderValue（段階3）', () => {
  const header = buildTrustedTypesReportOnlyHeaderValue();

  it('ディレクティブを "; " で 1 行連結する', () => {
    expect(header).not.toContain('\n');
    expect(header).toContain("require-trusted-types-for 'script'; ");
    expect(header).toContain('trusted-types sanitize-html');
    expect(header).toContain('report-uri /api/csp-report');
  });
});
