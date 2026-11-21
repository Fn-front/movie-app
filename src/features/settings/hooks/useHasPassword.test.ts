/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { PASSWORD_CHANGE_EVENT } from '@/constants/auth';

import { useHasPassword } from './useHasPassword';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/** `GET /api/user/totp` の応答を作る */
const respondWith = (body: unknown, ok = true) => {
  mockFetch.mockResolvedValue({
    ok,
    json: async () => body,
  });
};

// --- Tests ---

/**
 * パスワードの有無をサーバーと同じ根拠で出す（#1388）
 *
 * セッション（JWT）の値は最大5分遅れる。初回パスワードを設定した直後は
 * 画面が出す欄とサーバーが求める材料が食い違い、退会・パスワード変更・
 * メールアドレス変更が行き止まりになる。
 */
describe('useHasPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('API で取れた値がセッション由来の値より優先される', async () => {
    // 初回パスワードを設定した直後。JWT はまだ false のまま
    respondWith({ data: { hasPassword: true } });

    const { result } = renderHook(() => useHasPassword(false));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('逆向き（セッションが true・実体が false）も API に従う', async () => {
    respondWith({ data: { hasPassword: false } });

    const { result } = renderHook(() => useHasPassword(true));

    await waitFor(() => expect(result.current).toBe(false));
  });

  /*
    ⛔ API を唯一の根拠にしない。取得に失敗した利用者から欄が消えると、
    これまで使えていた操作ができなくなる（#1378 のレビューで確認した判断）
  */
  describe('API から取れないときはセッション由来の値に倒す', () => {
    it('応答が ok でない', async () => {
      respondWith({ data: { hasPassword: true } }, false);

      const { result } = renderHook(() => useHasPassword(false));

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(result.current).toBe(false);
    });

    it('通信が失敗する', async () => {
      mockFetch.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useHasPassword(true));

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(result.current).toBe(true);
    });

    it('真偽値が入っていない', async () => {
      // 握り潰して false にすると「パスワードを持っていない」と誤って扱う
      respondWith({ data: {} });

      const { result } = renderHook(() => useHasPassword(true));

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(result.current).toBe(true);
    });
  });

  /**
   * 同じ画面でパスワードを設定したら取り直す
   *
   * 合図を出しているのは `ChangePasswordForm`（#1372 / #1378）。
   * これが無いと、設定した本人が再読み込みするまで行き止まりのまま。
   */
  it('PASSWORD_CHANGE_EVENT で取り直す', async () => {
    respondWith({ data: { hasPassword: false } });

    const { result } = renderHook(() => useHasPassword(false));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);

    respondWith({ data: { hasPassword: true } });
    act(() => {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT));
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  /*
    ⛔ `useState<boolean | null>(null)` を `useState(sessionHasPassword)` に
    変える退行を捕まえる。初期化してしまうと、セッションが後から確定しても
    古い値を抱えたままになり、**取得に失敗した利用者に逆の欄を出し続ける**
  */
  it('セッション由来の値が後から変わっても追従する', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const { result, rerender } = renderHook(
      ({ session }) => useHasPassword(session),
      { initialProps: { session: true } },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current).toBe(true);

    rerender({ session: false });

    expect(result.current).toBe(false);
  });

  /*
    ⚠️ 古い応答で新しい応答を上書きしない。マウント時の取得が遅れて
    イベント由来の取得より後に解決すると、設定前の false が設定後の true を
    潰し、直したはずの行き止まりが静かに戻る
  */
  it('追い越された応答は捨てる', async () => {
    let resolveSlow: ((value: unknown) => void) | undefined;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSlow = resolve;
      }),
    );

    const { result } = renderHook(() => useHasPassword(false));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // 設定が終わった合図。こちらが先に解決する
    respondWith({ data: { hasPassword: true } });
    act(() => {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT));
    });
    await waitFor(() => expect(result.current).toBe(true));

    // 遅れていたマウント時の応答（設定前の値）が後から届く
    await act(async () => {
      resolveSlow?.({
        ok: true,
        json: async () => ({ data: { hasPassword: false } }),
      });
    });

    expect(result.current).toBe(true);
  });

  it('アンマウント後は合図を受け取らない', async () => {
    respondWith({ data: { hasPassword: false } });

    const { unmount } = renderHook(() => useHasPassword(false));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    unmount();

    window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
