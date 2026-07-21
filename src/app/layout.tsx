import type { Metadata } from 'next';
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='ja' suppressHydrationWarning>
      <head>
        {/* ストレージキーは STORAGE_KEYS.THEME ('movie-app:theme') と同期すること */}
        {/* CSP は script-src 'unsafe-inline' を許容するため nonce は付与しない */}
        {/*
          Trusted Types（段階3, Report-Only）について:
          この <script> は SSR で静的にドキュメントへ埋め込まれる「インラインスクリプト」であり、
          DOM 注入 sink（innerHTML / script.text 代入 / eval 等）ではない。よって
          `require-trusted-types-for 'script'` の対象外で、Report-Only でも enforce でも
          違反にならない（挙動は script-src 'unsafe-inline' 側で許可される）。
          そのため named ポリシー経由へ書き換える必要はなく、固定文字列のまま維持する。
          ランタイム注入が必要になった場合に備えたポリシーは
          src/lib/security/trustedTypes.ts（theme-init）に用意している。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('movie-app:theme');var d=t==='dark'||((t==='system'||t===null||t==='')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()",
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
