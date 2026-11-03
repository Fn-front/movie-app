/**
 * Cookie同意バナー（オプトイン）
 *
 * 未決定のときだけ表示する。無視しても `analytics_storage` は `denied` の
 * ままなので、操作を強制しない。
 */

'use client';

import { memo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button/button';
import { ARIA_LABELS, ROUTES } from '@/constants';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { getGaMeasurementId } from '@/utils/analytics';

import { setBannerHeightVar } from '../../utils/bannerHeight';
import styles from './cookieConsentBanner.module.scss';

/**
 * Cookie同意バナー
 *
 * アクセシビリティの方針:
 * - DOM 上は本文の後ろに置く。AppLayout のスキップリンクが「最初の
 *   フォーカス可能要素」である前提を崩さないため
 * - スキップリンクも自動フォーカス移動も設けない。操作を強制しないので
 *   到達性の要求は緩く、ランドマークか Tab 順の末尾で到達できれば足りる
 * - 初回描画なので aria-live は不適。ランドマーク化で担保する
 * - 「同意する」と「同意しない」は同じ variant にして視覚的重みを揃える。
 *   閉じる × は置かない（ダークパターンの回避）。
 *   ghost（枠線のみ）にしているのは、バナー自体が画面下部の帯として十分
 *   目立つため。塗りつぶしの variant だと全幅のボタンが2つ並んで画面の
 *   基調から浮く
 */
export const CookieConsentBanner = memo(function CookieConsentBanner() {
  const { consent, grant, deny } = useCookieConsent();
  const bannerRef = useRef<HTMLElement>(null);

  // 計測しない設定なら同意を求める対象が無い
  const isVisible = getGaMeasurementId() !== null && consent === 'unset';

  useEffect(() => {
    const element = bannerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setBannerHeightVar(Math.ceil(entry.contentRect.height));
    });
    observer.observe(element);

    return () => {
      // カスタム lint は ResizeObserver を検出しないので手動で担保する
      observer.disconnect();
      // バナーが消えるのは同意／拒否の直後＝最頻パス。外し忘れると
      // トーストが浮いたままになる
      setBannerHeightVar(null);
    };
  }, [isVisible]);

  const handleGrant = useCallback(() => {
    grant();
  }, [grant]);

  const handleDeny = useCallback(() => {
    deny();
  }, [deny]);

  if (!isVisible) return null;

  return (
    <section
      ref={bannerRef}
      role='region'
      aria-label={ARIA_LABELS.COOKIE_BANNER}
      className={styles.c_cookie_banner}
    >
      <div className={styles.c_cookie_banner__container}>
        <p className={styles.c_cookie_banner__text}>
          利用状況の把握のため Google
          アナリティクスを利用しています。同意いただいた場合にのみ Cookie
          を使用します。送信される情報の内容は
          <Link href={ROUTES.PRIVACY} className={styles.c_cookie_banner__link}>
            プライバシーポリシー
          </Link>
          をご覧ください。
        </p>

        <div className={styles.c_cookie_banner__actions}>
          <Button variant='ghost' onClick={handleDeny}>
            同意しない
          </Button>
          <Button variant='ghost' onClick={handleGrant}>
            同意する
          </Button>
        </div>
      </div>
    </section>
  );
});

CookieConsentBanner.displayName = 'CookieConsentBanner';
