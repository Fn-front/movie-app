import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Noto_Sans_JP } from 'next/font/google';

import { AppQueryProvider } from '@/components/providers/queryProvider';
import { AppSessionProvider } from '@/components/providers/sessionProvider';
import { AppToastProvider } from '@/components/providers/toastProvider';
import { ThemeProvider } from '@/components/providers/themeProvider';
import '@/styles/app.scss';

const noto = Noto_Sans_JP({
  weight: ['300', '400', '500', '700'],
  style: 'normal',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Movie App',
  description: '映画ウォッチリスト管理アプリケーション',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonce を middleware が設定した x-nonce ヘッダから取得し、
  // インライン初期化スクリプトに付与する（'unsafe-inline' 除去のため）。
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang='ja' suppressHydrationWarning>
      <head>
        {/* ストレージキーは STORAGE_KEYS.THEME ('movie-app:theme') と同期すること */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('movie-app:theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()",
          }}
        />
      </head>
      <body className={noto.className}>
        <AppSessionProvider>
          <AppQueryProvider>
            <ThemeProvider />
            <AppToastProvider>{children}</AppToastProvider>
          </AppQueryProvider>
        </AppSessionProvider>
      </body>
    </html>
  );
}
