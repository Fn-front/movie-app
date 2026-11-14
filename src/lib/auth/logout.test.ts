/**
 * ログアウト処理のテスト
 *
 * 見るのは**順序**。`signOut` は `window.location.href` による完全遷移を
 * 始めるため、後始末を後ろに置くと実行されずにドキュメントが破棄される。
 * 逆にバナーの抑止を遅らせると、遷移までの往復のあいだバナーが出る。
 */

const mockSignOut = jest.fn();
jest.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const mockSendConsentUpdate = jest.fn();
const mockDeleteGaCookies = jest.fn();
jest.mock('@/utils/analytics', () => ({
  sendConsentUpdate: (...args: unknown[]) => mockSendConsentUpdate(...args),
  deleteGaCookies: () => mockDeleteGaCookies(),
}));

import { ROUTES } from '@/constants';
import {
  __resetBannerSuppressionForTest,
  isBannerSuppressed,
} from '@/features/cookieConsent/utils/bannerSuppression';
import {
  getStoredConsentState,
  recordConsentDecision,
} from '@/utils/cookieConsent';

import { cleanUpBeforeSignOut, logout } from './logout';

const ME = 'user-me';
const T1 = '2026-11-03T00:00:00.000Z';

describe('logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    __resetBannerSuppressionForTest();
    mockSignOut.mockResolvedValue(undefined);
  });

  describe('cleanUpBeforeSignOut', () => {
    it('ログイン中に行った同意を消す', () => {
      recordConsentDecision('granted', ME, T1);

      cleanUpBeforeSignOut();

      expect(getStoredConsentState()).toBe('unset');
      expect(mockSendConsentUpdate).toHaveBeenCalledWith(false);
      expect(mockDeleteGaCookies).toHaveBeenCalled();
    });

    it('未認証時の同意は残す', () => {
      // 端末の匿名利用者の意思なので、他人のログアウトでは消さない
      recordConsentDecision('granted', '', T1);

      cleanUpBeforeSignOut();

      expect(getStoredConsentState()).toBe('granted');
      expect(mockSendConsentUpdate).not.toHaveBeenCalled();
      expect(mockDeleteGaCookies).not.toHaveBeenCalled();
    });
  });

  describe('順序', () => {
    it('signOut より前に同意レコードを消す', async () => {
      // 後ろに置くと、完全遷移が始まって実行されない
      recordConsentDecision('granted', ME, T1);
      let stateAtSignOut: string | null = null;
      mockSignOut.mockImplementation(() => {
        stateAtSignOut = getStoredConsentState();
        return Promise.resolve();
      });

      await logout();

      expect(stateAtSignOut).toBe('unset');
    });

    it('signOut より前にバナーを抑止する', async () => {
      // 抑止が遅れると、遷移までの2往復のあいだバナーが出る（#1133）
      recordConsentDecision('granted', ME, T1);
      let suppressedAtSignOut = false;
      mockSignOut.mockImplementation(() => {
        suppressedAtSignOut = isBannerSuppressed();
        return Promise.resolve();
      });

      await logout();

      expect(suppressedAtSignOut).toBe(true);
    });

    it('signOut が失敗したら抑止を戻す', async () => {
      // 遷移が始まらなかったのに抑止したままだと、バナーが二度と出ない。
      // しかも同意レコードは既に消えているので再同意もできなくなる
      recordConsentDecision('granted', ME, T1);
      mockSignOut.mockRejectedValue(new Error('network'));

      await expect(logout()).rejects.toThrow('network');

      expect(isBannerSuppressed()).toBe(false);
    });

    it('消すものが無くてもバナーは抑止する', async () => {
      // 未同意のままログアウトした場合。遷移するまで出す必要はない
      let suppressedAtSignOut = false;
      mockSignOut.mockImplementation(() => {
        suppressedAtSignOut = isBannerSuppressed();
        return Promise.resolve();
      });

      await logout();

      expect(suppressedAtSignOut).toBe(true);
    });
  });

  it('既定ではログイン画面へ戻す', async () => {
    await logout();

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: ROUTES.LOGIN });
  });

  it('遷移先を指定できる', async () => {
    await logout('/privacy');

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/privacy' });
  });
});
