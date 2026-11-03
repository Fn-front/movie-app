/**
 * @jest-environment node
 */

/**
 * 同意レコードの読み書きが SSR で落ちないことを確認する
 *
 * `/privacy` の撤回トグルはサーバーでも描画されるため、window が無い環境で
 * 読み出しが throw すると SSR ごと落ちる。
 *
 * なお subscribeConsent は window を前提にしているが、React の
 * useSyncExternalStore は SSR では subscribe を呼ばないため対象外。
 */

import {
  clearConsentRecord,
  clearOwnedConsent,
  getEffectiveConsentState,
  getStoredConsentRecord,
  recordConsentDecision,
} from './cookieConsent';

describe('cookieConsent（SSR）', () => {
  it('window が無くても読み出しは未決定を返す', () => {
    expect(getStoredConsentRecord()).toEqual({
      state: 'unset',
      at: null,
      owner: '',
      version: null,
    });
    expect(getEffectiveConsentState()).toBe('unset');
  });

  it('window が無くても書き込み・消去が throw しない', () => {
    expect(() => recordConsentDecision('granted', 'user-1')).not.toThrow();
    expect(() => clearConsentRecord()).not.toThrow();
    expect(() => clearOwnedConsent()).not.toThrow();
  });
});
