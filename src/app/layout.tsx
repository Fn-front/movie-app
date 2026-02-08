import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';

import { AppSessionProvider } from '@/components/providers/sessionProvider';
import { AppToastProvider } from '@/components/providers/toastProvider';
import '@/styles/app.scss';

const noto = Noto_Sans_JP({
  weight: ['300', '400', '500', '700'],
  style: 'normal',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'テンプレ',
  description: 'テンプレ',
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
          <AppToastProvider>
            <div className='l_global_container'>
              <main className='l_main'>
                <div className='l_container'>{children}</div>
              </main>
            </div>
          </AppToastProvider>
        </AppSessionProvider>
      </body>
    </html>
  );
}
