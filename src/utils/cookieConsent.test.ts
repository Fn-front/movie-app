/**
 * 同意レコードの永続化のテスト
 */

import { STORAGE_KEYS } from '@/constants/common';
import { COOKIE_CONSENT_VERSION } from '@/constants/user';
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  clearConsentRecord,
  clearOwnedConsent,
  getEffectiveConsentState,
  getStoredConsentAt,
  getStoredConsentOwner,
  getStoredConsentRecord,
  getStoredConsentState,
  getStoredConsentVersion,
  isConsentValue,
  recordConsentDecision,
  subscribeConsent,
  writeConsentRecord,
} from './cookieConsent';

const T1 = '2026-11-03T00:00:00.000Z';

describe('cookieConsent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  describe('読み出し', () => {
    it('未保存なら未決定を返す', () => {
      expect(getStoredConsentState()).toBe('unset');
      expect(getStoredConsentAt()).toBeNull();
      expect(getStoredConsentOwner()).toBe('');
      expect(getStoredConsentVersion()).toBeNull();
    });

    it('保存された granted / denied を返す', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'granted');
      expect(getStoredConsentState()).toBe('granted');

      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'denied');
      expect(getStoredConsentState()).toBe('denied');
    });

    it('未知の値は未決定として扱う（壊れた値で同意済みにしない）', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'yes');
      expect(getStoredConsentState()).toBe('unset');

      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'unset');
      expect(getStoredConsentState()).toBe('unset');
    });

    it('空文字の日時は null として扱う', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT_AT, '');
      expect(getStoredConsentAt()).toBeNull();
    });

    it('版は数値へ正規化し、解釈できない値は null にする', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT_VERSION, '2');
      expect(getStoredConsentVersion()).toBe(2);

      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT_VERSION, 'abc');
      expect(getStoredConsentVersion()).toBeNull();
    });

    it('読み取りが throw しても未決定へ倒す', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(getStoredConsentState()).toBe('unset');
      expect(getStoredConsentAt()).toBeNull();
      expect(getStoredConsentOwner()).toBe('');
      expect(getStoredConsentVersion()).toBeNull();
    });
  });

  describe('getEffectiveConsentState', () => {
    it('現行版の同意はそのまま返す', () => {
      recordConsentDecision('granted', 'user-1', T1);
      expect(getEffectiveConsentState()).toBe('granted');
    });

    it('版が古い同意は未決定として扱う（バナーを再表示させる）', () => {
      recordConsentDecision('granted', 'user-1', T1);
      window.localStorage.setItem(
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        String(COOKIE_CONSENT_VERSION - 1),
      );
      expect(getEffectiveConsentState()).toBe('unset');
      // 記録自体は消さない
      expect(getStoredConsentState()).toBe('granted');
      expect(getStoredConsentAt()).toBe(T1);
    });

    it('版が未保存の同意も未決定として扱う', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'granted');
      expect(getEffectiveConsentState()).toBe('unset');
    });
  });

  describe('書き込み', () => {
    it('4キーをまとめて書き、未決定は状態キーを消す', () => {
      writeConsentRecord({
        state: 'granted',
        at: T1,
        owner: 'user-1',
        version: 3,
      });

      expect(getStoredConsentRecord()).toEqual({
        state: 'granted',
        at: T1,
        owner: 'user-1',
        version: 3,
      });

      writeConsentRecord({
        state: 'unset',
        at: null,
        owner: '',
        version: null,
      });

      expect(
        window.localStorage.getItem(STORAGE_KEYS.COOKIE_CONSENT),
      ).toBeNull();
      expect(
        window.localStorage.getItem(STORAGE_KEYS.COOKIE_CONSENT_AT),
      ).toBeNull();
    });

    it('所有者→版→日時→状態 の順に書く（状態キーがコミット点）', () => {
      const order: string[] = [];
      jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation((key: string) => {
          order.push(key);
        });
      jest
        .spyOn(Storage.prototype, 'removeItem')
        .mockImplementation((key: string) => {
          order.push(key);
        });

      writeConsentRecord({
        state: 'granted',
        at: T1,
        owner: 'user-1',
        version: 1,
      });

      expect(order).toEqual([
        STORAGE_KEYS.COOKIE_CONSENT_OWNER,
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        STORAGE_KEYS.COOKIE_CONSENT_AT,
        STORAGE_KEYS.COOKIE_CONSENT,
      ]);
    });

    it('途中の書き込みが throw しても呼び出し側へ伝播させない', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() =>
        writeConsentRecord({
          state: 'granted',
          at: T1,
          owner: 'user-1',
          version: 1,
        }),
      ).not.toThrow();
    });

    it('recordConsentDecision は現行版と現在時刻を添えて書く', () => {
      recordConsentDecision('denied', 'user-9');

      const record = getStoredConsentRecord();
      expect(record.state).toBe('denied');
      expect(record.owner).toBe('user-9');
      expect(record.version).toBe(COOKIE_CONSENT_VERSION);
      expect(Number.isNaN(Date.parse(record.at ?? ''))).toBe(false);
    });
  });

  describe('消去', () => {
    it('状態→日時→版→所有者 の順に消す（書き込みと逆順）', () => {
      // 書き込みと同じ順で消すと、一瞬 state=granted かつ owner='' が
      // 観測され、他人の同意が「未認証時の同意」として扱われてしまう
      recordConsentDecision('granted', 'user-1', T1);

      const order: string[] = [];
      jest
        .spyOn(Storage.prototype, 'removeItem')
        .mockImplementation((key: string) => {
          order.push(key);
        });

      clearConsentRecord();

      expect(order).toEqual([
        STORAGE_KEYS.COOKIE_CONSENT,
        STORAGE_KEYS.COOKIE_CONSENT_AT,
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        STORAGE_KEYS.COOKIE_CONSENT_OWNER,
      ]);
    });

    it('clearOwnedConsent はログイン中の同意だけを消す', () => {
      recordConsentDecision('granted', 'user-1', T1);

      expect(clearOwnedConsent()).toBe(true);
      expect(getStoredConsentState()).toBe('unset');
      expect(getStoredConsentOwner()).toBe('');
    });

    it('clearOwnedConsent は未認証時の同意を残す', () => {
      recordConsentDecision('granted', '', T1);

      expect(clearOwnedConsent()).toBe(false);
      expect(getStoredConsentState()).toBe('granted');
      expect(getStoredConsentAt()).toBe(T1);
    });

    it('clearOwnedConsent は未保存でも何もしない', () => {
      expect(clearOwnedConsent()).toBe(false);
    });
  });

  describe('購読', () => {
    it('同一タブの書き込みをカスタムイベントで通知する', () => {
      const onChange = jest.fn();
      const unsubscribe = subscribeConsent(onChange);

      recordConsentDecision('granted', 'user-1', T1);
      expect(onChange).toHaveBeenCalledTimes(1);

      unsubscribe();
      recordConsentDecision('denied', 'user-1', T1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('消去も通知する', () => {
      const onChange = jest.fn();
      const unsubscribe = subscribeConsent(onChange);

      clearConsentRecord();
      expect(onChange).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('別タブの storage は状態キーの変化だけを拾う', () => {
      const onChange = jest.fn();
      const unsubscribe = subscribeConsent(onChange);

      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEYS.COOKIE_CONSENT_AT }),
      );
      expect(onChange).not.toHaveBeenCalled();

      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEYS.THEME }),
      );
      expect(onChange).not.toHaveBeenCalled();

      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEYS.COOKIE_CONSENT }),
      );
      expect(onChange).toHaveBeenCalledTimes(1);

      // key=null は localStorage.clear() を意味するので拾う
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(onChange).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('購読解除でリスナーを両方外す', () => {
      const onChange = jest.fn();
      subscribeConsent(onChange)();

      window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEYS.COOKIE_CONSENT }),
      );

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('isConsentValue', () => {
    it('API へ送れる3値だけを通す', () => {
      expect(isConsentValue('unset')).toBe(true);
      expect(isConsentValue('granted')).toBe(true);
      expect(isConsentValue('denied')).toBe(true);
      // UI 内部の表現は API へ流さない
      expect(isConsentValue('unknown')).toBe(false);
      expect(isConsentValue(null)).toBe(false);
    });
  });
});
