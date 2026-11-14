/**
 * 同意バナーの抑止状態のテスト
 */

import {
  __resetBannerSuppressionForTest,
  clearSigningOut,
  isBannerSuppressed,
  markSigningOut,
  setConsentSyncPending,
  subscribeBannerSuppression,
} from './bannerSuppression';

describe('bannerSuppression', () => {
  beforeEach(() => {
    __resetBannerSuppressionForTest();
  });

  it('初期状態では抑止しない', () => {
    expect(isBannerSuppressed()).toBe(false);
  });

  it('同期中は抑止する', () => {
    setConsentSyncPending(true);
    expect(isBannerSuppressed()).toBe(true);

    setConsentSyncPending(false);
    expect(isBannerSuppressed()).toBe(false);
  });

  it('ログアウト中は抑止する', () => {
    markSigningOut();
    expect(isBannerSuppressed()).toBe(true);
  });

  it('ログアウトが失敗したときは明示的に戻せる', () => {
    // 遷移が始まらなかった場合だけ戻す。戻せないとバナーが二度と出ない
    markSigningOut();

    clearSigningOut();

    expect(isBannerSuppressed()).toBe(false);
  });

  it('同じ理由を重ねても通知しない', () => {
    const listener = jest.fn();
    markSigningOut();
    subscribeBannerSuppression(listener);

    markSigningOut();

    expect(listener).not.toHaveBeenCalled();
  });

  it('ログアウト中は同期の解除で戻らない', () => {
    // 遷移するまで出さないのが目的なので、同期側の都合で解けては困る
    markSigningOut();
    setConsentSyncPending(true);
    setConsentSyncPending(false);

    expect(isBannerSuppressed()).toBe(true);
  });

  it('抑止の有無が変わったら購読者へ通知する', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeBannerSuppression(listener);

    setConsentSyncPending(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setConsentSyncPending(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    markSigningOut();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('抑止の有無が変わらなければ通知しない', () => {
    // 購読者が見るのは集約した1つの真偽値なので、内訳だけが変わっても
    // 再レンダリングさせない
    const listener = jest.fn();
    subscribeBannerSuppression(listener);

    setConsentSyncPending(false);
    expect(listener).not.toHaveBeenCalled();

    setConsentSyncPending(true);
    setConsentSyncPending(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // 既に抑止中なので、理由が増えても通知は不要
    markSigningOut();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
