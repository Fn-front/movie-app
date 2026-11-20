/**
 * アカウント削除フックのテスト（#932）
 *
 * ⚠️ 固定したいのは**成功したあとの後始末**。削除は通ったのに同意レコードが
 * 残る・ログアウトしない、は気づきにくい。
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { ACCOUNT_DELETE_MESSAGES } from '@/constants/auth';

import { useDeleteAccount } from './useDeleteAccount';

// --- Mocks ---

const mockLogout = jest.fn();
jest.mock('@/lib/auth/logout', () => ({
  logout: (...args: unknown[]) => mockLogout(...args),
}));

const mockClearConsentRecord = jest.fn();
const mockClearOwnedConsent = jest.fn();
jest.mock('@/utils/cookieConsent', () => ({
  clearConsentRecord: () => mockClearConsentRecord(),
  clearOwnedConsent: () => mockClearOwnedConsent(),
}));

// --- Helpers ---

const okResponse = (body: unknown = { success: true }) =>
  ({ ok: true, json: () => Promise.resolve(body) }) as Response;

const errorResponse = (status: number, message: string) =>
  ({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false, error: { message } }),
  }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  mockLogout.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue(okResponse());
});

// --- Tests ---

describe('useDeleteAccount', () => {
  describe('削除', () => {
    it('DELETE で送り、確認情報を本文に載せる', async () => {
      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({
          currentPassword: 'pw',
          code: '123456',
        });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/user',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ currentPassword: 'pw', code: '123456' }),
        }),
      );
    });

    /**
     * ⚠️ **`clearOwnedConsent()` ではない**（#932）。
     *
     * あちらは owner が空文字なら何もしないため、退会では同意レコードが
     * 端末に残る。無条件消去のほうが正しい。
     */
    it('同意レコードを無条件に消す', async () => {
      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'pw' });
      });

      expect(mockClearConsentRecord).toHaveBeenCalled();
      expect(mockClearOwnedConsent).not.toHaveBeenCalled();
    });

    it('成功したらログアウトする', async () => {
      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'pw' });
      });

      expect(mockLogout).toHaveBeenCalled();
    });

    // 消す前にログアウトすると、セッションが無くなって削除が 401 になる
    it('同意レコードを消してからログアウトする', async () => {
      const order: string[] = [];
      mockClearConsentRecord.mockImplementation(() => order.push('consent'));
      mockLogout.mockImplementation(async () => {
        order.push('logout');
      });

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'pw' });
      });

      expect(order).toEqual(['consent', 'logout']);
    });
  });

  describe('失敗したとき', () => {
    it('サーバーのメッセージをそのまま出す', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        errorResponse(400, 'パスワードが違います'),
      );

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'wrong' });
      });

      expect(result.current.error).toBe('パスワードが違います');
      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockClearConsentRecord).not.toHaveBeenCalled();
    });

    it('やり直せるよう送信状態を戻す', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        errorResponse(400, 'パスワードが違います'),
      );

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'wrong' });
      });

      expect(result.current.isSubmitting).toBe(false);
    });

    /**
     * ⚠️ **削除は通ったがログアウトに失敗した**場合。
     *
     * 「やり直してください」と出すと、消えているのにもう一度試して
     * 401 を見ることになる。再読み込みを促す。
     */
    it('ログアウトに失敗したら再読み込みを促す', async () => {
      mockLogout.mockRejectedValue(new Error('signout failed'));

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'pw' });
      });

      expect(result.current.error).toBe(ACCOUNT_DELETE_MESSAGES.LOGOUT_FAILED);
    });

    it('本文が JSON でなくてもメッセージを出す', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response);

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'pw' });
      });

      expect(result.current.error).toBe(ACCOUNT_DELETE_MESSAGES.FAILED);
    });

    it('clearError で消せる', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        errorResponse(400, 'エラー'),
      );

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.deleteAccount({ currentPassword: 'wrong' });
      });

      act(() => result.current.clearError());

      expect(result.current.error).toBeNull();
    });
  });

  describe('第2要素の要否', () => {
    it('設定済みなら要ると判定する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        okResponse({ data: { method: 'totp' } }),
      );

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.loadRequirement();
      });

      await waitFor(() =>
        expect(result.current.secondFactorRequired).toBe(true),
      );
    });

    it('未設定なら要らないと判定する', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        okResponse({ data: { method: null } }),
      );

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.loadRequirement();
      });

      expect(result.current.secondFactorRequired).toBe(false);
    });

    /**
     * ⚠️ 取得に失敗したら「要る」側へ倒す。
     *
     * 入力欄を出さずに送ると、サーバーが 400 を返すだけで利用者には
     * 理由が分からない。
     */
    it.each([
      ['応答が非2xx', { ok: false, json: () => Promise.resolve({}) }],
      ['通信に失敗', null],
    ])('%s なら要る側へ倒す', async (_label, response) => {
      (global.fetch as jest.Mock).mockImplementation(() =>
        response
          ? Promise.resolve(response)
          : Promise.reject(new Error('down')),
      );

      const { result } = renderHook(() => useDeleteAccount());

      await act(async () => {
        await result.current.loadRequirement();
      });

      expect(result.current.secondFactorRequired).toBe(true);
    });

    // 判定前は null。false で初期化すると設定済みの利用者が送信できてしまう
    it('判定するまでは null', () => {
      const { result } = renderHook(() => useDeleteAccount());

      expect(result.current.secondFactorRequired).toBeNull();
    });
  });
});
