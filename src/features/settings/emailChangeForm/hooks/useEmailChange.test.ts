/**
 * メールアドレス変更フックのテスト（#1359）
 *
 * ⚠️ 固定したいのは**成功したあとの後始末**。セッションを更新しないと
 * 設定画面が旧アドレスを出し続け、変わったのか分からない。
 */

import { act, renderHook } from '@testing-library/react';

import {
  EMAIL_CHANGE_MESSAGES,
  EMAIL_CHANGE_VIEW,
} from '@/constants/emailChange';

import { useEmailChange } from './useEmailChange';

// --- Mocks ---

const mockUpdate = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => ({ update: mockUpdate }),
}));

// --- Helpers ---

const okResponse = () =>
  ({ ok: true, json: () => Promise.resolve({ success: true }) }) as Response;

const errorResponse = (message: string) =>
  ({
    ok: false,
    json: () => Promise.resolve({ success: false, error: { message } }),
  }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue(okResponse());
});

// --- Tests ---

describe('useEmailChange', () => {
  describe('確認コードの送信', () => {
    it('新しいアドレスとパスワードを送る', async () => {
      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.requestCode('new@example.com', 'pw');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/user/email-change/request',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            newEmail: 'new@example.com',
            currentPassword: 'pw',
          }),
        }),
      );
    });

    it('成功したらコード入力へ進む', async () => {
      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.requestCode('new@example.com', 'pw');
      });

      expect(result.current.view).toBe(EMAIL_CHANGE_VIEW.CODE);
      expect(result.current.pendingEmail).toBe('new@example.com');
      expect(result.current.notice).toBe(EMAIL_CHANGE_MESSAGES.CODE_SENT);
    });

    // 失敗したまま進むと、送っていないコードの入力を求めることになる
    it('失敗したら進まない', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        errorResponse('このメールアドレスは使用できません。'),
      );

      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.requestCode('taken@example.com', 'pw');
      });

      expect(result.current.view).toBe(EMAIL_CHANGE_VIEW.INPUT);
      expect(result.current.error).toBe('このメールアドレスは使用できません。');
    });

    it('通信に失敗してもメッセージを出す', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.requestCode('new@example.com', 'pw');
      });

      expect(result.current.error).toBe(EMAIL_CHANGE_MESSAGES.FAILED);
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe('確認コードの検証', () => {
    /** コード入力の状態にする */
    const advanceToCode = async (result: {
      current: ReturnType<typeof useEmailChange>;
    }) => {
      await act(async () => {
        await result.current.requestCode('new@example.com', 'pw');
      });
    };

    /**
     * ⚠️ 宛先は**送信時に渡した値**を使う。利用者が入力欄を書き換えても、
     * コードを送ったアドレスと照合しないと必ず失敗する。
     */
    it('送信したアドレスとコードを送る', async () => {
      const { result } = renderHook(() => useEmailChange());
      await advanceToCode(result);

      await act(async () => {
        await result.current.confirmCode('123456');
      });

      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/user/email-change/confirm',
        expect.objectContaining({
          body: JSON.stringify({
            newEmail: 'new@example.com',
            code: '123456',
          }),
        }),
      );
    });

    /**
     * ⚠️ **セッションを更新する。** しないと設定画面もパスワード変更
     * フォームも旧アドレスを出し続ける。
     */
    it('成功したらセッションを更新して入力へ戻る', async () => {
      const { result } = renderHook(() => useEmailChange());
      await advanceToCode(result);

      await act(async () => {
        await result.current.confirmCode('123456');
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.current.view).toBe(EMAIL_CHANGE_VIEW.INPUT);
      expect(result.current.notice).toBe(EMAIL_CHANGE_MESSAGES.CHANGED);
    });

    // 失敗したら入れ直せるよう、コード入力のまま留まる
    it('失敗したらコード入力に留まる', async () => {
      const { result } = renderHook(() => useEmailChange());
      await advanceToCode(result);

      (global.fetch as jest.Mock).mockResolvedValue(
        errorResponse('確認コードが間違っています。'),
      );

      await act(async () => {
        await result.current.confirmCode('000000');
      });

      expect(result.current.view).toBe(EMAIL_CHANGE_VIEW.CODE);
      expect(result.current.error).toBe('確認コードが間違っています。');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  it('やり直すと入力へ戻る', async () => {
    const { result } = renderHook(() => useEmailChange());

    await act(async () => {
      await result.current.requestCode('new@example.com', 'pw');
    });

    act(() => result.current.reset());

    expect(result.current.view).toBe(EMAIL_CHANGE_VIEW.INPUT);
    expect(result.current.pendingEmail).toBe('');
  });
});
