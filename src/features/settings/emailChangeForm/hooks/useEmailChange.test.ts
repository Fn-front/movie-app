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

/**
 * URL で応答を振り分ける fetch
 *
 * ⚠️ 全部に同じ応答を返すと、`/api/user/totp` の取得を**実装から消しても
 * テストが落ちない**。第2要素の有無はここでしか分からないので、
 * 取りにいっていること自体を観測できるようにする。
 */
const mockFetchByUrl = (
  overrides: Record<string, Response | Promise<Response>> = {},
) => {
  global.fetch = jest.fn((url: string) => {
    for (const [fragment, response] of Object.entries(overrides)) {
      if (url.includes(fragment)) return Promise.resolve(response);
    }

    return Promise.resolve(okResponse());
  }) as unknown as typeof fetch;
};

/** 第2要素の方式を返す `/api/user/totp` */
const totpResponse = (method: string | null) =>
  ({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { method } }),
  }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue(undefined);
  mockFetchByUrl();
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
     * ⛔ **二段階認証を設定している利用者がここで詰んでいた**
     * （#1359 の2回目レビュー）。サーバーは第2要素を要求するのに、
     * フックは一度も送っていなかった。
     */
    it('第2要素も一緒に送る', async () => {
      const { result } = renderHook(() => useEmailChange());
      await advanceToCode(result);

      await act(async () => {
        await result.current.confirmCode('123456', '654321');
      });

      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/user/email-change/confirm',
        expect.objectContaining({
          body: JSON.stringify({
            newEmail: 'new@example.com',
            code: '123456',
            secondFactorCode: '654321',
          }),
        }),
      );
    });

    /**
     * ⚠️ 空文字では送らない。スキーマが長さを見ていると空文字で 400 になり、
     * 第2要素を使っていない利用者まで弾かれる。
     */
    it('第2要素が無ければ載せない', async () => {
      const { result } = renderHook(() => useEmailChange());
      await advanceToCode(result);

      await act(async () => {
        await result.current.confirmCode('123456', '');
      });

      const body = (
        (global.fetch as jest.Mock).mock.calls.at(-1)![1] as { body: string }
      ).body;

      expect(JSON.parse(body)).not.toHaveProperty('secondFactorCode');
    });

    /**
     * ⚠️ 通信そのものが失敗しても文言を出す。黙って止まると、利用者は
     * 変わったのかどうか分からないまま同じコードを入れ直す。
     */
    it('通信に失敗してもメッセージを出す', async () => {
      const { result } = renderHook(() => useEmailChange());
      await advanceToCode(result);

      (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

      await act(async () => {
        await result.current.confirmCode('123456');
      });

      expect(result.current.error).toBe(EMAIL_CHANGE_MESSAGES.FAILED);
      expect(result.current.isSubmitting).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
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

  /**
   * ⛔ **判定を画面へ渡せないと、第2要素の入力欄が出せない。**
   *
   * サーバーは設定済みの利用者に第2要素を要求する。画面が欄を出さないと
   * 空文字で送って必ず 400 になり、しかもその時点で確認コードは焼けている。
   */
  describe('第2要素の方式', () => {
    it('コード入力へ進むときに取りにいく', async () => {
      mockFetchByUrl({ '/api/user/totp': totpResponse('totp') });

      const { result } = renderHook(() => useEmailChange());

      expect(result.current.secondFactorMethod).toBeUndefined();

      await act(async () => {
        await result.current.requestCode('new@example.com', 'pw');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/user/totp');
      expect(result.current.secondFactorMethod).toBe('totp');
    });

    it('未設定なら null になる', async () => {
      mockFetchByUrl({ '/api/user/totp': totpResponse(null) });

      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.requestCode('new@example.com', 'pw');
      });

      expect(result.current.secondFactorMethod).toBeNull();
    });

    /**
     * ⚠️ 取得に失敗したら「要る」側へ倒す。欄を出さずに送るとサーバーが
     * 400 を返すだけで、利用者には理由が分からない。
     */
    it('取得に失敗したら要る側へ倒す', async () => {
      mockFetchByUrl({
        '/api/user/totp': Promise.reject(new Error('offline')) as never,
      });

      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.requestCode('new@example.com', 'pw');
      });

      expect(result.current.secondFactorMethod).toBe('totp');
    });

    /**
     * ⚠️ メールOTP の利用者は手元でコードを作れない。この経路が無いと、
     * 二段階認証を有効にした時点でアドレスを変更できなくなる。
     */
    it('第2要素のコードを送れる', async () => {
      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.sendSecondFactorCode();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/user/totp/send-challenge',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('送信に失敗したら理由を出す', async () => {
      mockFetchByUrl({
        'send-challenge': errorResponse('送信できませんでした'),
      });

      const { result } = renderHook(() => useEmailChange());

      await act(async () => {
        await result.current.sendSecondFactorCode();
      });

      expect(result.current.error).toBe('送信できませんでした');
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
