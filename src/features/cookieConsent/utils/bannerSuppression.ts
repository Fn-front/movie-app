/**
 * 同意バナーを「まだ出すべきでない」間だけ抑止する
 *
 * バナーは localStorage の同意レコードだけを見て即座に描く
 * （`useCookieConsent` / 設計上、localStorage が唯一の真実源）。
 * ところが**その値が最終的な答えとは限らない**場面が2つある。
 *
 * 1. **サーバー同期の往復中**（#1137）
 *    ログイン中の初回マージは `getSettings()` の応答を待ってから
 *    端末へ書き戻す。端末に記録が無くサーバーにある状態（別の端末で
 *    同意した・ログアウトで消えた直後の再ログイン）では、往復のあいだ
 *    「未決定」に見えてバナーが出てから消える。
 *
 * 2. **ログアウト処理中**（#1133）
 *    `logout()` は同意レコードを同期的に消してから `signOut()` を呼ぶ。
 *    `signOut()` は遷移前にネットワーク2往復するため、その間バナーが出る。
 *    遷移先でも（同意が消えているので）出るが、遷移元で先に出る必要はない。
 *
 * どちらも「同意状態がまだ確定していない／もう画面を離れる」ので、
 * 確定するまで出さない。
 *
 * ⚠️ 抑止は `visibility` ではなく**未描画**にする。バナーは
 * `position: fixed` の帯で、`--cookie-banner-height` を介して本文と
 * ボトムナビの位置を決めている（`bannerHeight.ts`）。枠だけ残すと
 * その分の余白が先に空いてしまう。
 */

'use client';

/** 同期の応答待ちか */
let syncPending = false;
/**
 * ログアウト処理中か
 *
 * 一度立ったら戻さない。目的は「遷移するまで出さない」ことなので、
 * 同期側の都合で解除されては困る
 */
let signingOut = false;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** バナーを出してよくない状態か */
export function isBannerSuppressed(): boolean {
  return syncPending || signingOut;
}

/** サーバー同期の進行状況を伝える */
export function setConsentSyncPending(pending: boolean): void {
  if (syncPending === pending) return;

  const before = isBannerSuppressed();
  syncPending = pending;
  if (isBannerSuppressed() !== before) notify();
}

/** ログアウト処理に入ったことを伝える（`logout()` から呼ぶ） */
export function markSigningOut(): void {
  if (signingOut) return;

  const before = isBannerSuppressed();
  signingOut = true;
  if (isBannerSuppressed() !== before) notify();
}

/** 抑止状態の変化を購読する */
export function subscribeBannerSuppression(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** テスト用。モジュールスコープの状態は Jest のモジュールキャッシュを跨ぐ */
export function __resetBannerSuppressionForTest(): void {
  syncPending = false;
  signingOut = false;
  listeners.clear();
}
