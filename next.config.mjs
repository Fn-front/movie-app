/* eslint-disable no-undef */
import withBundleAnalyzer from '@next/bundle-analyzer';

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

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

  // GLSL シェーダーファイルを raw text としてインポート（Turbopack: dev 用）
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https://image.tmdb.org data: blob:",
              // data: は @fullcalendar/core が内部でアイコンフォント(fcicons)を
              // base64エンコードした data: URI で読み込むために必要
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co",
              'frame-src https://www.youtube.com',
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default withAnalyzer(nextConfig);
