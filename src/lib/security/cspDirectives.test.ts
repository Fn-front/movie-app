/**
 * CSP ディレクティブ共有モジュール（単一ソース）のテスト
 */

import { EXTERNAL_URLS } from '@/constants/external';

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
    expect(scriptSrc).toBe(
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
    );
    expect(directives.some((d) => d.startsWith('report-to'))).toBe(false);
    expect(directives.some((d) => d.startsWith('report-uri'))).toBe(false);
  });

  it("isDev=true で script-src に 'unsafe-eval' を付与する", () => {
    const directives = getCspDirectives({ isDev: true });
    const scriptSrc = directives.find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBe(
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com 'unsafe-eval'",
    );
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
      "img-src 'self' https://image.tmdb.org data: blob: https://www.googletagmanager.com https://*.google-analytics.com",
    );
    expect(directives).toContain("font-src 'self' data:");
    expect(directives).toContain('frame-src https://www.youtube-nocookie.com');
    expect(directives).toContain("frame-ancestors 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("form-action 'self'");
    expect(directives).toContain("object-src 'none'");
  });

  describe('GA4（Consent Mode では同意の有無によらず読み込む）', () => {
    const directives = getCspDirectives();
    const find = (name: string) =>
      directives.find((d) => d.startsWith(`${name} `)) ?? '';

    it('script-src に gtag.js の配信元を許可する', () => {
      expect(find('script-src')).toContain('https://www.googletagmanager.com');
    });

    it('connect-src に計測ビーコンの送信先を許可する', () => {
      const connectSrc = find('connect-src');
      expect(connectSrc).toContain('https://www.googletagmanager.com');
      expect(connectSrc).toContain('https://*.google-analytics.com');
      expect(connectSrc).toContain('https://*.google.com');
      // 既存の許可を落としていない
      expect(connectSrc).toContain('https://*.supabase.co');
    });

    it('img-src にピクセル送信先を許可する', () => {
      const imgSrc = find('img-src');
      expect(imgSrc).toContain('https://www.googletagmanager.com');
      expect(imgSrc).toContain('https://*.google-analytics.com');
      expect(imgSrc).toContain('https://image.tmdb.org');
    });

    it('img-src に *.google.com を入れない（広告機能なし構成には不要）', () => {
      // accounts.google.com 等まで含む広いワイルドカードを開けない
      expect(find('img-src')).not.toContain('https://*.google.com');
    });

    it('*.analytics.google.com は入れない（公式の列挙に無い）', () => {
      expect(directives.join('; ')).not.toContain(
        'https://*.analytics.google.com',
      );
    });

    it('frame-src は nocookie ドメインのみ（GA を足しても増えない / youtube.com を足し戻さない）', () => {
      expect(find('frame-src')).toBe(
        'frame-src https://www.youtube-nocookie.com',
      );
    });
  });

  /**
   * 埋め込み先（`EXTERNAL_URLS.YOUTUBE_EMBED`）と `frame-src` は別々のリテラルで、
   * ずれると本番で埋め込みが丸ごとブロックされる。
   *
   * ⚠️ 上の厳密一致だけでは**片方向しか守れない**。`external.ts` を
   * `youtube.com` に戻し、`videoDialog.test.tsx` の期待値も直すと、
   * 全テストが緑のまま本番だけ壊れる。導出して突き合わせる。
   */
  describe('埋め込み先との整合（#937）', () => {
    it('frame-src が EXTERNAL_URLS.YOUTUBE_EMBED のオリジンと一致する', () => {
      const directives = getCspDirectives();
      const frameSrc = directives.find((d) => d.startsWith('frame-src'));

      expect(frameSrc).toBe(
        `frame-src ${new URL(EXTERNAL_URLS.YOUTUBE_EMBED).origin}`,
      );
    });
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
