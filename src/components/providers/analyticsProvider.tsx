/**
 * GA4（Consent Mode v2 / advanced）のプロバイダ
 *
 * gtag.js の読み込み、同意状態の反映、page_view の手動送信、
 * サーバー同期の起動をまとめて担う。`<AppSessionProvider>` の子として
 * 単一マウントすること（同期が多重に走らないようにするため）。
 *
 * effect の宣言順には意味がある。consent update を page_view より先に
 * 送るため、この順序を変えないこと。
 *   1. consent update（同意状態の反映。GA ID 無効でも Cookie 削除は行う。
 *      同意が成立した瞬間は、そのページの page_view も送り直す）
 *   2. page_view（GA ID 有効時のみ。パスが変わるたび）
 *   3〜5. サーバー同期（useConsentServerSync の内部に3つ）
 */

'use client';

import { memo, useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

import { useConsentServerSync } from '@/hooks/useConsentServerSync';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { getEffectiveConsentState } from '@/utils/cookieConsent';
import {
  buildGtagInitScript,
  buildPageLocation,
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

  // その page_view を **granted で送ったか**。
  //
  // 送り直してよいのは「まだ granted で送れていないページ」だけ。直前の
  // 同意状態で判定すると `granted → denied → granted` を区別できず、
  // 既に計上済みのページを二重に送る。遷移を伴わずにこの順を辿る経路は
  // 実在する（`/settings` と `/privacy` の同意トグル、ログアウトの後始末、
  // 別タブでの撤回・再同意）
  const lastPageViewGrantedRef = useRef(false);

  // 1. 同意状態の反映
  //
  // 同意が成立した瞬間（`unset` / `denied` → `granted`）は、現在のページの
  // page_view を送り直す。
  //
  // Consent Mode advanced では未同意でも Cookie を伴わない page_view を
  // 既に送っているが、**それは GA のレポートには出ない**。denied のヒットが
  // 反映されるのは behavioral modeling が働く場合だけで、`analytics_storage
  // = 'granted'` で1日1,000ユーザーを直近28日のうち7日以上、といった閾値が
  // ある。届かなければ「events triggered by users who decline consent aren't
  // reported」（support.google.com/analytics/answer/11161109）。
  //
  // 送り直さないと、ランディングページで同意した訪問者の最初の1ページが
  // 永久に計測されない（#1227。本番で実測した）。
  //
  // ⚠️ 将来 modeling の閾値に届く規模になったら再検討すること。そのときは
  // 同じ閲覧が「実イベント1件」と「モデル推定の素材」の両方に入る
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
      return;
    }

    // 2 がまだ送っていないなら、そちらが granted で送るので任せる。
    // 再訪問者（`<head>` のブートストラップが granted で始まる）はここを通る
    if (lastPageViewRef.current === null) return;

    // 既に granted で送ったページは送り直さない。重複になるだけ
    if (lastPageViewGrantedRef.current) return;

    // consent update の後に送る。逆順だとまだ denied のまま飛ぶ
    lastPageViewGrantedRef.current = true;
    sendPageView({
      pagePath: lastPageViewRef.current,
      pageLocation: buildPageLocation(),
      pageTitle: document.title,
    });
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
      // ⚠️ React 側の `consent` ではなく保存値を読む。再訪問者は
      // `<head>` のブートストラップが localStorage から granted で始めるため、
      // `useCookieConsent` がまだ 'unknown' を返している間でも **gtag は
      // 既に granted**。`consent` で判定すると「granted で送っていない」と
      // 誤記録し、直後の 1 が同じページを送り直して重複する
      lastPageViewGrantedRef.current = getEffectiveConsentState() === 'granted';
      sendPageView({
        pagePath: pathname,
        // window.location.href は使わない。クエリ文字列に検索キーワードや
        // パスワード再設定トークンが載るため（buildPageLocation 参照）
        pageLocation: buildPageLocation(),
        pageTitle: document.title,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [measurementId, pathname]);

  // 3〜5. サーバー同期（未認証時の掃除・初回マージ・変更追随）
  //
  // フックの呼び出し順＝effect の実行順なので、gtag まわりの 1・2 より
  // 後に置く。前に置くと冒頭のコメントと実際の順序が食い違い、
  // 「コメントどおりに並べ替えたら壊れる」状態になる
  useConsentServerSync(consent);

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
