/**
 * GA4（Consent Mode v2 / advanced）のプロバイダ
 *
 * gtag.js の読み込み、同意状態の反映、page_view の手動送信、
 * サーバー同期の起動をまとめて担う。`<AppSessionProvider>` の子として
 * 単一マウントすること（同期が多重に走らないようにするため）。
 *
 * effect の宣言順には意味がある。consent update を page_view より先に
 * 送るため、この順序を変えないこと。
 *   1. consent update（同意状態の反映。GA ID 無効でも Cookie 削除は行う）
 *   2. page_view（GA ID 有効時のみ）
 *   3〜4. サーバー同期（useConsentServerSync の内部）
 */

'use client';

import { memo, useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

import { useConsentServerSync } from '@/hooks/useConsentServerSync';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import {
  buildGtagInitScript,
  deleteGaCookies,
  getGaMeasurementId,
  sendConsentUpdate,
  sendPageView,
} from '@/utils/analytics';

export const AnalyticsProvider = memo(function AnalyticsProvider() {
  const { consent } = useCookieConsent();
  const pathname = usePathname();
  const measurementId = getGaMeasurementId();

  // 直近に送った page_view のパス。同一パスへの二重送信を防ぐ
  const lastPageViewRef = useRef<string | null>(null);

  useConsentServerSync(consent);

  // 1. 同意状態の反映
  //
  // 同意が成立しても page_view は送り直さない。Consent Mode advanced では
  // 未同意でも Cookie を伴わない page_view が既に送られているため、再送すると
  // 同じ閲覧が2件になる（同意まで gtag.js を読み込まない basic 構成なら
  // 再送が要るが、本構成は advanced）。
  useEffect(() => {
    if (consent === 'unknown') return;

    const granted = consent === 'granted';

    // gtag が未定義なのは GA ID 無効で <head> スクリプトを出していないとき。
    // 撤回だけは成立させたいので Cookie 削除は行う
    sendConsentUpdate(granted);

    if (!granted) {
      // consent update を先に送ってから消す。逆順だとキューに残ったヒットが
      // 削除直後に _ga を書き戻しうる
      deleteGaCookies();
    }
  }, [consent]);

  // 2. page_view の手動送信
  //
  // 初回マウントでも送る（初回スキップのガードを入れるとランディングページが
  // 計上されない）。usePathname はクエリだけの変化では再発火しないので、
  // router.replace によるフィルタ操作で増えることはない。
  // useSearchParams は依存に入れない（root layout で使うと静的プリレンダから
  // 外れる）。URL は送信時点で window.location.href を読む。
  useEffect(() => {
    if (measurementId === null || pathname === null) return;
    if (lastPageViewRef.current === pathname) return;

    // App Router のメタデータは Suspense 越しに解決されるため、effect の
    // 時点では前ページのタイトルが残っていることがある（person/[id] は
    // async generateMetadata なので確実にずれる）。1フレーム待ってから読む
    const frame = requestAnimationFrame(() => {
      lastPageViewRef.current = pathname;
      sendPageView({
        pagePath: pathname,
        pageLocation: window.location.href,
        pageTitle: document.title,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [measurementId, pathname]);

  if (measurementId === null) return null;

  return (
    <>
      <Script
        id='ga-loader'
        strategy='afterInteractive'
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      {/* dataLayer / gtag は再定義しない。<head> で積んだ consent default が消える */}
      <Script id='ga-init' strategy='afterInteractive'>
        {buildGtagInitScript(measurementId)}
      </Script>
    </>
  );
});

AnalyticsProvider.displayName = 'AnalyticsProvider';
