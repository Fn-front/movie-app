/**
 * ログアウトの共通処理
 *
 * `signOut` は `window.location.href` による完全遷移を行うため、React の
 * effect で `authenticated → unauthenticated` を観測する前にドキュメントが
 * 破棄される。ログアウト時にやるべき後始末は、必ず `signOut` を呼ぶ「前」に
 * 同期的に済ませる必要がある。
 *
 * 素の `signOut()` を直接呼ばず、必ずこのモジュールを経由すること。
 * 呼び出しが増えたときに後始末が素通りするのを防ぐため、集約している。
 */

'use client';

import { signOut } from 'next-auth/react';

import { ROUTES } from '@/constants';
import { deleteGaCookies, sendConsentUpdate } from '@/utils/analytics';
import { clearOwnedConsent } from '@/utils/cookieConsent';

/**
 * ログアウト前の後始末
 *
 * ログイン中に行われた Cookie 同意（owner 付き）を消し、計測も止める。
 * 残すと、ログアウトした端末を未認証の第三者が使ったときに前の利用者の
 * 同意がそのまま適用される（`layout.tsx` の `<head>` スクリプトは認証状態を
 * 同期読みできないため、React 側で補正しても1ページロード分の窓が残る）。
 *
 * 未認証時の同意（owner が空文字）は端末の匿名利用者の意思なので残す。
 */
export function cleanUpBeforeSignOut(): void {
  if (!clearOwnedConsent()) return;

  // consent update を先に送ってから消す。逆順だとキューに残ったヒットが
  // 削除直後に _ga を書き戻しうる
  sendConsentUpdate(false);
  deleteGaCookies();
}

/**
 * ログアウトする
 *
 * @param callbackUrl 遷移先。既定はログイン画面
 */
export async function logout(
  callbackUrl: string = ROUTES.LOGIN,
): Promise<void> {
  cleanUpBeforeSignOut();
  await signOut({ callbackUrl });
}
