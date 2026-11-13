import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';

import { AnalyticsProvider } from '@/components/providers/analyticsProvider';
import { AppQueryProvider } from '@/components/providers/queryProvider';
import { AppSessionProvider } from '@/components/providers/sessionProvider';
import { AppToastProvider } from '@/components/providers/toastProvider';
import { ThemeProvider } from '@/components/providers/themeProvider';
import { APP_NAME } from '@/constants/app';
import { CookieConsentBanner } from '@/features/cookieConsent/component/cookieConsentBanner/cookieConsentBanner';
import { buildZodJitlessScript } from '@/lib/security/zodJitless';
import {
  buildConsentBootstrapScript,
  getGaMeasurementId,
} from '@/utils/analytics';
import '@/styles/app.scss';

const noto = Noto_Sans_JP({
  weight: ['300', '400', '500', '700'],
  style: 'normal',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: '映画ウォッチリスト管理アプリケーション',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // analyticsProvider は 'use client' なので、サーバーからは呼べない。
  // 文字列の組み立てはサーバー安全な utils/analytics から直接行う
  const consentBootstrapScript =
    getGaMeasurementId() === null ? null : buildConsentBootstrapScript();
  const zodJitlessScript = buildZodJitlessScript();

  return (
    <html lang='ja' suppressHydrationWarning>
      <head>
        {/*
          ⚠️ **zod のチャンクより先に実行されること**が前提（#1099）。
          ⚠️ ドキュメント順では React が hoist するチャンクのほうが先にある。
          先に走るのは async スクリプトがパーサの同期処理に割り込めないため。
          zod は JIT を使えるかを
          `new Function("")` で試すので、本番の CSP（'unsafe-eval' 無し）に
          当たって enforce の違反が毎ロード報告される。スキーマは
          src/schema/*.ts のトップレベルで作られるため、普通のモジュールから
          z.config() を呼んでも間に合わない。理由は lib/security/zodJitless.ts
        */}
        <script dangerouslySetInnerHTML={{ __html: zodJitlessScript }} />
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
        {/*
          Consent Mode の default。gtag.js の読み込みより前に dataLayer へ
          積まれている必要があるため <head> に置く。localStorage を同期読みして
          初期値を決めるので、同意済みの再訪問者に「denied で始めて update する」
          往復が起きない。
          文字列は buildConsentBootstrapScript が組み立てる（ストレージキーと
          版を補間して定数との同期漏れを防ぐため）。GA ID が無効なら null。
          テーマ初期化と同じく SSR で静的に埋め込むインラインスクリプトなので、
          Trusted Types の対象外。
        */}
        {consentBootstrapScript !== null && (
          <script
            dangerouslySetInnerHTML={{ __html: consentBootstrapScript }}
          />
        )}
      </head>
      <body className={noto.className}>
        <AppSessionProvider>
          <AppQueryProvider>
            <ThemeProvider />
            <AnalyticsProvider />
            <AppToastProvider>{children}</AppToastProvider>
            {/*
              バナーは本文の後ろに置く。AppLayout のスキップリンクが
              「DOM 上で最初のフォーカス可能要素」である前提を崩さないため
            */}
            <CookieConsentBanner />
          </AppQueryProvider>
        </AppSessionProvider>
      </body>
    </html>
  );
}
