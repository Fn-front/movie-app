/**
 * ログアウトの共通処理
 *
 * 最後に `navigateTo()` で完全遷移するため、ログアウト時にやるべき後始末は
 * 必ず**遷移より前に**同期的に済ませる必要がある。
 *
 * ⚠️ **遷移の前に「ログアウト済み」の状態が React から観測できる**（#1195）。
 * `signOut({ redirect: false })` は返る前に内部でセッションを取り直すため、
 * `status` が `authenticated → unauthenticated` に変わってから遷移までの
 * 2往復ぶんの窓がある。以前は `signOut` が即座に遷移していたので
 * この窓は無かった。
 * → それを期限切れと解釈して `logout()` を呼び直さないよう、
 *   `sessionExpiryHandler` は `isSigningOut()` を見ている。
 *
 * 素の `signOut()` を直接呼ばず、必ずこのモジュールを経由すること。
 * 呼び出しが増えたときに後始末が素通りするのを防ぐため、集約している。
 */

'use client';

import { signOut } from 'next-auth/react';

import { ROUTES } from '@/constants';
import {
  clearSigningOut,
  markSigningOut,
} from '@/features/cookieConsent/utils/bannerSuppression';
import { deleteGaCookies, sendConsentUpdate } from '@/utils/analytics';
import { clearOwnedConsent } from '@/utils/cookieConsent';
import { confirmSessionCleared } from '@/lib/auth/sessionProbe';
import { navigateTo } from '@/utils/navigate';

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
 * @throws セッションを消せなかった場合
 */
export async function logout(
  callbackUrl: string = ROUTES.LOGIN,
): Promise<void> {
  // 同意バナーを止めるのが先。`signOut` は遷移の前に2往復するので、
  // 後に回すとその間だけバナーが出る（#1133）。遷移先でも出るものなので、
  // 離れる画面で先に出す意味はない
  markSigningOut();
  cleanUpBeforeSignOut();

  let destination: string;

  try {
    // ⚠️ `redirect: true`（既定）にしない（#1195）。
    // `signOut` は `res.ok` を検査せず `window.location.href` へ進むため
    // （`node_modules/next-auth/react.js`）、CSRF 検証に落ちた POST のように
    // **リダイレクト先だけ返って Cookie が消えない**失敗を成功として扱う。
    // 利用者は元の状態に戻るだけで、理由が分からない。
    const result = await signOut({ redirect: false, callbackUrl });

    // 実際に消えたかを確かめる。
    //
    // ⚠️ `getSession()`（next-auth/react）は使えない。内部の `fetchData` が
    // **通信失敗も非2xxも `null` に潰す**ため、「訊けなかった」を
    // 「消えた」と誤判定する（#1136 と同じ罠）。timeout も無い。
    // 本文が `null` かどうかで見る専用の probe を使う
    if (!(await confirmSessionCleared())) {
      throw new Error('Sign out did not clear the session');
    }

    // 遷移先はサーバーが検証した値を使う。`callbackUrl` をそのまま
    // 使うと、呼び出し側が外部URLを渡したときオープンリダイレクトになる
    destination = result?.url ?? ROUTES.LOGIN;
  } catch (error) {
    // 遷移しない（csrf 取得・`/signout` の POST・セッションの確認のいずれかが
    // 失敗した）。抑止したままだとバナーが二度と出ず、同意レコードは既に
    // 消えているので再同意もできない。呼び出し側は `void logout()` で
    // 握り潰すため、ここで戻さないと誰も戻せない
    clearSigningOut();
    throw error;
  }

  navigateTo(destination);
}
