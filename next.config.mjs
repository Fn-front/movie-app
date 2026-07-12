/* eslint-disable no-undef */
import withBundleAnalyzer from '@next/bundle-analyzer';

// CSP の値は src/lib/security/csp.ts と共有（単一ソース化）。
// next.config.mjs（Node ESM）は TS を直接 import できないため、プレーン
// ESM の共有モジュールを双方から import して値の二重定義を防ぐ。
import {
  buildCspHeaderValue,
  buildReportingEndpointsValue,
} from './src/lib/security/cspDirectives.mjs';

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const isDev = process.env.NODE_ENV === 'development';

/**
 * HTML ページ向け CSP。
 * script-src に 'unsafe-inline' を許容することで静的プリレンダ（nonce 不要）を維持する。
 * dev は Next.js 開発ツールが eval を利用するため 'unsafe-eval' も付与する。
 * 違反監視のため report-to / report-uri を付与する（自前 /api/csp-report で収集）。
 */
const cspHeaderValue = buildCspHeaderValue({ isDev, withReporting: true });

// Reporting API のエンドポイント定義。CSP の report-to グループ名と対応させる。
const reportingEndpointsValue = buildReportingEndpointsValue();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // React Strict Mode有効化（開発環境でEffect二重実行による潜在バグを検出）
  reactStrictMode: true,

  // 画像最適化設定
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
    ],
  },

  // Turbopack ファイルシステムキャッシュを無効化（raw import の HMR 不具合回避）
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },

  // SCSS設定（sassパッケージがあれば自動で有効）
  sassOptions: {
    includePaths: ['./src/styles'],
  },

  // GLSL シェーダーファイルを raw text (string) としてインポート（Turbopack: dev 用）
  turbopack: {
    rules: {
      '*.glsl': {
        type: 'raw',
      },
    },
  },

  // GLSL シェーダーファイルを raw text としてインポート（webpack: build 用）
  webpack(config) {
    config.module.rules.push({
      test: /\.glsl$/,
      type: 'asset/source',
    });
    return config;
  },

  // 環境変数の検証（オプション）
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // CSP は unsafe-inline を許容し nonce 非依存のため、全パスへ静的に配信する。
          // これにより静的プリレンダ（○ Static）を維持できる。
          {
            key: 'Content-Security-Policy',
            value: cspHeaderValue,
          },
          // report-to（CSP）が参照する Reporting API のエンドポイント定義。
          // 違反レポートは /api/csp-report が受信する。
          {
            key: 'Reporting-Endpoints',
            value: reportingEndpointsValue,
          },
        ],
      },
      {
        // /api/* は JSON API のためスクリプト実行やフレーム化を一切必要としない。
        // 最も制限的な CSP で上書きし、多層防御を維持する
        // （後勝ちで /(.*) の CSP を上書きする）。
        source: '/api/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default withAnalyzer(nextConfig);
