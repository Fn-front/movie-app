/**
 * Cookie同意の購読フックのテスト
 */

import { act, renderHook } from '@testing-library/react';

import { STORAGE_KEYS } from '@/constants/common';
import { COOKIE_CONSENT_VERSION } from '@/constants/user';
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  getStoredConsentRecord,
  recordConsentDecision,
} from '@/utils/cookieConsent';
import { useCookieConsent } from './useCookieConsent';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

describe('useCookieConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    });
  });

  it('未保存なら未決定を返す', () => {
    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.consent).toBe('unset');
  });

  it('保存済みの同意を返す', () => {
    recordConsentDecision('granted', 'user-1');

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.consent).toBe('granted');
  });

  it('版が古い同意は未決定として返す（バナーを再表示させる）', () => {
    recordConsentDecision('granted', 'user-1');
    localStorage.setItem(
      STORAGE_KEYS.COOKIE_CONSENT_VERSION,
      String(COOKIE_CONSENT_VERSION - 1),
    );

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.consent).toBe('unset');
  });

  it('grant で同意を記録する（所有者と版を添えて）', () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.grant();
    });

    expect(result.current.consent).toBe('granted');
    const record = getStoredConsentRecord();
    expect(record.owner).toBe('user-1');
    expect(record.version).toBe(COOKIE_CONSENT_VERSION);
    expect(record.at).not.toBeNull();
  });

  it('deny で拒否を記録する', () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.deny();
    });

    expect(result.current.consent).toBe('denied');
  });

  it('未ログイン時の操作は所有者を空文字で記録する', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.grant();
    });

    expect(getStoredConsentRecord().owner).toBe('');
  });

  it('同一タブの変更を購読する', () => {
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.consent).toBe('unset');

    act(() => {
      recordConsentDecision('denied', 'user-1');
    });

    expect(result.current.consent).toBe('denied');
  });

  it('別タブの storage を購読する', () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      // 別タブが書いた状態を再現する
      localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'granted');
      localStorage.setItem(
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        String(COOKIE_CONSENT_VERSION),
      );
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEYS.COOKIE_CONSENT }),
      );
    });

    expect(result.current.consent).toBe('granted');
  });

  it('アンマウントで購読を解除する', () => {
    const { result, unmount } = renderHook(() => useCookieConsent());
    unmount();

    expect(() => {
      recordConsentDecision('granted', 'user-1');
      window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
    }).not.toThrow();
    expect(result.current.consent).toBe('unset');
  });

  it('サーバー同期を行わない（API を呼ばない）', () => {
    // 同期は useConsentServerSync の責務。ここに持たせると、バナー・トグル・
    // プロバイダがそれぞれマウントされるたびに API が多重に呼ばれる
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.grant();
    });
    act(() => {
      result.current.deny();
    });

    expect(mockGetSettings).not.toHaveBeenCalled();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});
