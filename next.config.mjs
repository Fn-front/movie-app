/** @type {import('next').NextConfig} */
const nextConfig = {
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

  // SCSS設定（sassパッケージがあれば自動で有効）
  sassOptions: {
    includePaths: ['./src/styles'],
  },

  // 環境変数の検証（オプション）
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};

export default nextConfig;
