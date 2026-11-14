/**
 * Cookie同意バナー（オプトイン）
 *
 * 未決定のときだけ表示する。無視しても `analytics_storage` は `denied` の
 * ままなので、操作を強制しない。
 */

'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button/button';
import { ARIA_LABELS, ROUTES } from '@/constants';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { getGaMeasurementId } from '@/utils/analytics';

import {
  isBannerSuppressed,
  subscribeBannerSuppression,
} from '../../utils/bannerSuppression';
import {
  resolveBannerHeight,
  setBannerHeightVar,
} from '../../utils/bannerHeight';
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

  // 同意状態がまだ確定していない／もう画面を離れる間は出さない。
  // 理由は bannerSuppression.ts（#1137 / #1133）
  const isSuppressed = useSyncExternalStore(
    subscribeBannerSuppression,
    isBannerSuppressed,
    // SSR とハイドレーション時は consent が 'unknown' で既に非表示なので、
    // ここは抑止なしで揃えておけばよい
    () => false,
  );

  // 計測しない設定なら同意を求める対象が無い
  const isVisible =
    getGaMeasurementId() !== null && consent === 'unset' && !isSuppressed;

  useEffect(() => {
    const element = bannerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      // 境界ボックスで測る。切り上げは setBannerHeightVar 側で行う
      setBannerHeightVar(resolveBannerHeight(entry));
    });
    // 境界ボックスの変化で発火させる。既定（content-box）のままだと、
    // 文量が同じで境界線幅だけ変わったときにコールバックが呼ばれず、
    // CSS 変数が古い値のまま残る。現状 border-width は定数なので実害は
    // 無いが、その前提に寄りかからずに済む
    observer.observe(element, { box: 'border-box' });

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
