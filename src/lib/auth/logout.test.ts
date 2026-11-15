/**
 * ログアウト処理のテスト
 *
 * 見るのは**順序**。`signOut` は `window.location.href` による完全遷移を
 * 始めるため、後始末を後ろに置くと実行されずにドキュメントが破棄される。
 * 逆にバナーの抑止を遅らせると、遷移までの往復のあいだバナーが出る。
 */

const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
jest.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

/**
 * 遷移を止める
 *
 * `logout()` は `signOut({ redirect: false })` に変わったため、遷移は
 * 自前で行う（#1195）。jsdom の `window.location` は差し替えられないので、
 * 遷移を担うモジュールごとモックする
 */
const mockNavigateTo = jest.fn();
jest.mock('@/utils/navigate', () => ({
  navigateTo: (...args: unknown[]) => mockNavigateTo(...args),
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
    // 既定は「サインアウト成功 → セッションも消えている」
    mockSignOut.mockResolvedValue({ url: 'http://localhost/auth/signin' });
    mockGetSession.mockResolvedValue(null);
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

    expect(mockSignOut).toHaveBeenCalledWith({
      redirect: false,
      callbackUrl: ROUTES.LOGIN,
    });
  });

  it('遷移先を指定できる', async () => {
    await logout('/privacy');

    expect(mockSignOut).toHaveBeenCalledWith({
      redirect: false,
      callbackUrl: '/privacy',
    });
  });

  /**
   * セッションが消えたことを確かめてから遷移する（#1195）
   *
   * ⚠️ `signOut` は `res.ok` を検査せず `window.location.href` へ進む
   * （`node_modules/next-auth/react.js`）。CSRF 検証に落ちた POST は
   * リダイレクト先だけ返して **Cookie を消さない**ため、`redirect: true` の
   * ままだと「遷移はするが何も変わらない」失敗を成功として扱う。
   */
  describe('セッションの確認', () => {
    it('消えていればサーバーが返した遷移先へ進む', async () => {
      mockSignOut.mockResolvedValue({ url: 'http://localhost/privacy' });

      await logout('/privacy');

      expect(mockNavigateTo).toHaveBeenCalledWith('http://localhost/privacy');
    });

    // 呼び出し側が外部URLを渡してもオープンリダイレクトにしない。
    // 遷移先はサーバーが検証した値だけを使う
    it('遷移先を返さなければログイン画面へ倒す', async () => {
      mockSignOut.mockResolvedValue({});

      await logout('https://evil.example.com/');

      expect(mockNavigateTo).toHaveBeenCalledWith(ROUTES.LOGIN);
    });

    it('セッションが残っていたら失敗として扱う', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'u1' } });

      await expect(logout()).rejects.toThrow(/did not clear the session/);
    });

    it('セッションが残っていたら遷移しない', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'u1' } });

      await expect(logout()).rejects.toThrow();

      expect(mockNavigateTo).not.toHaveBeenCalled();
    });

    // 抑止したままだとバナーが二度と出ず、同意レコードは既に消えている
    it('セッションが残っていたら抑止を戻す', async () => {
      recordConsentDecision('granted', ME, T1);
      mockGetSession.mockResolvedValue({ user: { id: 'u1' } });

      await expect(logout()).rejects.toThrow();

      expect(isBannerSuppressed()).toBe(false);
    });

    /**
     * 第2要素が未了のセッションも「残っている」と判定する。
     *
     * `totpPending` のとき `session.user.id` は空文字なので、
     * `user.id` で見ると**失敗を成功と誤判定**する。
     * セッションオブジェクトの有無で見ること
     */
    it('第2要素が未了のセッションが残っていても失敗として扱う', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: '', email: '' },
        totpPending: true,
      });

      await expect(logout()).rejects.toThrow(/did not clear the session/);
    });
  });
});
