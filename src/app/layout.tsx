import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';

import { AppQueryProvider } from '@/components/providers/queryProvider';
import { AppSessionProvider } from '@/components/providers/sessionProvider';
import { AppToastProvider } from '@/components/providers/toastProvider';
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
    <html lang='ja'>
      <body className={noto.className}>
        <AppSessionProvider>
          <AppQueryProvider>
            <AppToastProvider>{children}</AppToastProvider>
          </AppQueryProvider>
        </AppSessionProvider>
      </body>
    </html>
  );
}
