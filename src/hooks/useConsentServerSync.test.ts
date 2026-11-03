/**
 * Cookie同意のサーバー同期のテスト
 *
 * マージ規則そのものは resolveConsentMerge.test.ts が23ケースで網羅する。
 * ここは「結果を localStorage と PUT にどう反映するか」「いつ走るか」に絞る。
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { COOKIE_CONSENT_VERSION } from '@/constants/user';
import {
  getStoredConsentRecord,
  recordConsentDecision,
  writeConsentRecord,
} from '@/utils/cookieConsent';
import {
  __resetConsentSyncForTest,
  useConsentServerSync,
} from './useConsentServerSync';
import type { CookieConsentState } from './useCookieConsent';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

const ME = 'user-me';
const OTHER = 'user-other';
const T1 = '2026-11-03T00:00:00.000Z';
const T2 = '2026-11-04T00:00:00.000Z';

/** GET のレスポンス（同意以外は既定値） */
const serverSettings = (
  cookieConsent: 'unset' | 'granted' | 'denied',
  cookieConsentAt: string | null,
  cookieConsentVersion: number | null,
) => ({
  theme: 'system' as const,
  notificationEnabled: false,
  streamingNoticeScope: 'any' as const,
  cookieConsent,
  cookieConsentAt,
  cookieConsentVersion,
});

const authenticated = () => ({
  data: { user: { id: ME } },
  status: 'authenticated',
});

function render(consent: CookieConsentState = 'unset') {
  return renderHook(
    ({ value }: { value: CookieConsentState }) => useConsentServerSync(value),
    { initialProps: { value: consent } },
  );
}

describe('useConsentServerSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    __resetConsentSyncForTest();
    mockUseSession.mockReturnValue(authenticated());
    mockUpdateSettings.mockResolvedValue(undefined);
  });

  describe('発火条件', () => {
    it('未認証では GET しない', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      render();

      await act(async () => {});
      expect(mockGetSettings).not.toHaveBeenCalled();
    });

    it('セッション解決中（loading）では GET しない', async () => {
      mockUseSession.mockReturnValue({ data: null, status: 'loading' });

      render();

      await act(async () => {});
      expect(mockGetSettings).not.toHaveBeenCalled();
    });

    it('GA ID が無効でも同期する', async () => {
      // 同期は GA とは独立の関心事。条件に入れると GA を止めている間の
      // 撤回がサーバーに残らない
      delete process.env.NEXT_PUBLIC_GA_ID;
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      render();

      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));
    });

    it('1ページロードで GET は1回だけ', async () => {
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      const { rerender } = render();
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));

      rerender({ value: 'granted' });
      rerender({ value: 'denied' });
      await act(async () => {});

      expect(mockGetSettings).toHaveBeenCalledTimes(1);
    });

    it('ユーザーが切り替わったら前のユーザーの応答を使い回さない', async () => {
      // inFlight を userId で keying していないと、A の GET の応答が
      // B のマージに使われ、A の同意が B のレコードへ書かれうる
      let resolveA: (value: unknown) => void = () => {};
      mockGetSettings.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveA = resolve;
        }),
      );

      const first = render();
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));
      first.unmount();

      // A の応答が返る前に B へ切り替わる
      mockUseSession.mockReturnValue({
        data: { user: { id: OTHER } },
        status: 'authenticated',
      });
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));
      render();

      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(2));

      // 遅れて返ってきた A の応答が B へ適用されない
      await act(async () => {
        resolveA(serverSettings('granted', T1, COOKIE_CONSENT_VERSION));
      });
      expect(getStoredConsentRecord().owner).not.toBe(ME);
    });

    it('セッションが変わらない限り再マウントでも GET しない', async () => {
      // syncedUserId のガード。外すとマウントのたびに GET が飛ぶ
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      const first = render();
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));
      first.unmount();

      render();
      await act(async () => {});

      expect(mockGetSettings).toHaveBeenCalledTimes(1);
    });

    it('StrictMode の二重マウントでも同期が成立する', async () => {
      // フラグで2回目を弾くと、1回目は cleanup で cancelled、2回目は skip に
      // なって同期が一度も成立しない。進行中の Promise を共有して回避する
      let resolveGet: (value: unknown) => void = () => {};
      mockGetSettings.mockReturnValue(
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
      );

      const first = render();
      first.unmount(); // StrictMode の1回目アンマウント相当
      render(); // 2回目のマウント

      await act(async () => {
        resolveGet(serverSettings('granted', T1, COOKIE_CONSENT_VERSION));
      });

      await waitFor(() =>
        expect(getStoredConsentRecord().state).toBe('granted'),
      );
      expect(mockGetSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('初回マージの反映', () => {
    it('サーバー値を端末へ降ろす', async () => {
      mockGetSettings.mockResolvedValue(
        serverSettings('granted', T1, COOKIE_CONSENT_VERSION),
      );

      render();

      await waitFor(() =>
        expect(getStoredConsentRecord()).toEqual({
          state: 'granted',
          at: T1,
          owner: ME,
          version: COOKIE_CONSENT_VERSION,
        }),
      );
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('端末値をサーバーへ上げる（未認証で得た同意）', async () => {
      recordConsentDecision('granted', '', T1);
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      render();

      await waitFor(() =>
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          cookieConsent: 'granted',
          cookieConsentAt: T1,
        }),
      );
      // 所有者が現在のユーザーへ付け替わる
      expect(getStoredConsentRecord().owner).toBe(ME);
    });

    it('完全に一致していれば何も書かない', async () => {
      recordConsentDecision('granted', ME, T1);
      mockGetSettings.mockResolvedValue(
        serverSettings('granted', T1, COOKIE_CONSENT_VERSION),
      );

      render();

      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
      await act(async () => {});
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('他人の同意レコードを端末から消し、サーバーにも書かない', async () => {
      recordConsentDecision('granted', OTHER, T1);
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      render();

      await waitFor(() => expect(getStoredConsentRecord().state).toBe('unset'));
      expect(getStoredConsentRecord().owner).toBe('');
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('サーバーが旧版なら状態が同じでも版を更新しにいく', async () => {
      recordConsentDecision('granted', ME, T1);
      mockGetSettings.mockResolvedValue(
        serverSettings('granted', T1, COOKIE_CONSENT_VERSION - 1),
      );

      render();

      await waitFor(() =>
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          cookieConsent: 'granted',
          cookieConsentAt: T1,
        }),
      );
    });
  });

  describe('応答待ち中の操作（compare-and-swap）', () => {
    it('待っている間に撤回したら、その撤回がサーバーへ届く', async () => {
      // マージ結果を捨てるだけだと、その操作は変更追随の発火条件
      // 「初回マージ完了後の変化」も満たさず永久に送られない
      recordConsentDecision('granted', '', T1);

      let resolveGet: (value: unknown) => void = () => {};
      mockGetSettings.mockReturnValue(
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
      );

      render();
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

      // 応答が返る前に利用者が撤回する
      act(() => {
        recordConsentDecision('denied', '', T2);
      });

      await act(async () => {
        resolveGet(serverSettings('granted', T1, COOKIE_CONSENT_VERSION));
      });

      await waitFor(() =>
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          cookieConsent: 'denied',
          cookieConsentAt: T2,
        }),
      );
      // 利用者の選択が覆らない
      expect(getStoredConsentRecord().state).toBe('denied');
    });
  });

  describe('変更の追随', () => {
    it('初回マージ後の変更をサーバーへ送る', async () => {
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      const { rerender } = render('unset');
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

      act(() => {
        recordConsentDecision('granted', ME, T2);
      });
      rerender({ value: 'granted' });

      await waitFor(() =>
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          cookieConsent: 'granted',
          cookieConsentAt: T2,
        }),
      );
    });

    it('サーバーから降ろしたばかりの値を送り返さない', async () => {
      // 直近送信値の ref を初回マージの結果でシードしていないと、
      // 再訪問のたびに PUT が飛ぶ
      mockGetSettings.mockResolvedValue(
        serverSettings('granted', T1, COOKIE_CONSENT_VERSION),
      );

      const { rerender } = render('unknown');
      await waitFor(() =>
        expect(getStoredConsentRecord().state).toBe('granted'),
      );

      // ハイドレーション後に unknown → granted と解決される
      rerender({ value: 'granted' });
      await act(async () => {});

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('unknown のままでは送らない', async () => {
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      const { rerender } = render('unset');
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

      rerender({ value: 'unknown' });
      await act(async () => {});

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('同じ値を繰り返し送らない', async () => {
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      const { rerender } = render('unset');
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

      act(() => {
        recordConsentDecision('denied', ME, T2);
      });
      rerender({ value: 'denied' });
      await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(1));

      rerender({ value: 'denied' });
      await act(async () => {});

      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
    });

    it('失敗した値は同じ値のまま再送できる（ref を先に進めない）', async () => {
      // 別の値へ切り替えるだけだと、ref が進んでいても通ってしまう。
      // 「失敗した値そのもの」が再送されることを見る
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      const { rerender } = render('unset');
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

      mockUpdateSettings.mockRejectedValueOnce(new Error('network'));
      act(() => {
        recordConsentDecision('denied', ME, T2);
      });
      rerender({ value: 'denied' });
      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);

      // いったん別の値を経由して同じ値へ戻す。ref が 'denied' まで進んで
      // いたら、この2回目は送られない
      rerender({ value: 'granted' });
      await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(2));
      rerender({ value: 'denied' });
      await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(3));
      expect(mockUpdateSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ cookieConsent: 'denied' }),
      );
    });

    it('壊れた日時は送らず null にする（400 ループを避ける）', async () => {
      // そのまま送ると zod が 400 を返し、端末側は修復されないまま
      // 同意操作のたびに失敗トーストが出続ける
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      const { rerender } = render('unset');
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

      act(() => {
        writeConsentRecord({
          state: 'denied',
          at: 'not-a-date',
          owner: ME,
          version: COOKIE_CONSENT_VERSION,
        });
      });
      rerender({ value: 'denied' });

      await waitFor(() =>
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          cookieConsent: 'denied',
          cookieConsentAt: null,
        }),
      );
    });
  });

  describe('失敗時', () => {
    it('GET に失敗したらトーストを出し、端末の値は変えない', async () => {
      recordConsentDecision('granted', ME, T1);
      mockGetSettings.mockRejectedValue(new Error('network'));

      render();

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(getStoredConsentRecord().state).toBe('granted');
    });

    it('GET 失敗後は次のマウントで再試行する', async () => {
      mockGetSettings.mockRejectedValueOnce(new Error('network'));
      const first = render();
      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      first.unmount();

      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));
      render();

      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(2));
    });

    it('PUT に失敗したらトーストを出し、端末の決定は巻き戻さない', async () => {
      recordConsentDecision('denied', '', T1);
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));
      mockUpdateSettings.mockRejectedValue(new Error('network'));

      render();

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(getStoredConsentRecord().state).toBe('denied');
    });
  });

  describe('ログアウト', () => {
    it('owner 付きのレコードを消す', async () => {
      recordConsentDecision('granted', ME, T1);
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      render();

      await waitFor(() => expect(getStoredConsentRecord().state).toBe('unset'));
    });

    it('未認証時の同意は残す', async () => {
      recordConsentDecision('granted', '', T1);
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      render();

      await act(async () => {});
      expect(getStoredConsentRecord().state).toBe('granted');
    });

    it('同期ガードを解除して再ログインで再同期できるようにする', async () => {
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));
      const first = render();
      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));
      first.unmount();

      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });
      const second = render();
      await act(async () => {});
      second.unmount();

      mockUseSession.mockReturnValue(authenticated());
      render();

      await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(2));
    });
  });

  describe('版の扱い', () => {
    it('版が古い端末レコードは未決定として扱い、記録は消さない', async () => {
      writeConsentRecord({
        state: 'granted',
        at: T1,
        owner: ME,
        version: COOKIE_CONSENT_VERSION - 1,
      });
      mockGetSettings.mockResolvedValue(serverSettings('unset', null, null));

      render();

      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
      await act(async () => {});

      expect(getStoredConsentRecord().state).toBe('granted');
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('サーバーが未来版なら上書きしない', async () => {
      recordConsentDecision('granted', ME, T1);
      mockGetSettings.mockResolvedValue(
        serverSettings('granted', T1, COOKIE_CONSENT_VERSION + 1),
      );

      render();

      await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
      await act(async () => {});

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });
  });
});
