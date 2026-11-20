/**
 * 二段階認証設定フックのテスト
 *
 * ここでは**再入ガード**だけを見る（#1287）。コンポーネント経由では
 * ボタンの `disabled` が先に効いてしまい、`inFlightRef` が外れても落ちない。
 * 公開APIを直接・同期的に2回呼べるのはフック側だけ。
 */

import { renderHook, act, waitFor } from '@testing-library/react';

import { useTwoFactorSettings } from './useTwoFactorSettings';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/** 初回マウントで走る状態取得 */
const statusResponse = () =>
  Promise.resolve({
    ok: true,
    json: async () => ({
      data: {
        enabled: true,
        method: 'email_otp',
        emailOtpAvailable: true,
        remainingRecoveryCodes: 7,
      },
    }),
  });

describe('useTwoFactorSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * ⚠️ `isSubmitting` では足りない（#1287）。
   *
   * state はボタンの `disabled` には効くが、連打や二重サブミットで**同時に
   * 走る**のは防げない。`useCallback` が捕まえた値は古いままなので、
   * 実装は ref で見ている。メールOTP では1回の余分な送信が60秒の再送間隔と
   * 日次の送信上限に直撃する。
   */
  it('送信中にもう一度呼んでも2通目を送らない', async () => {
    mockFetch.mockImplementationOnce(statusResponse);

    // 2回目の fetch は解決させない＝1通目が飛行中のまま
    let settle: (() => void) | undefined;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = () =>
            resolve({ ok: true, json: async () => ({ data: {} }) });
        }),
    );

    const { result } = renderHook(() => useTwoFactorSettings());

    // 初回の状態取得を待つ
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      // await しない。飛行中に2回目を重ねる
      void result.current.sendChallenge();
      void result.current.sendChallenge();
    });

    // 状態取得(1) + 送信(1)。再入が通っていれば 3 になる
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      settle?.();
    });
  });

  /**
   * ガードは `finally` で必ず外す。外し忘れると、1回送信した時点で
   * **以降どのボタンも二度と効かない**（画面をリロードするまで直らない）。
   */
  it('送信が終われば次の送信は通る', async () => {
    mockFetch.mockImplementationOnce(statusResponse);

    const { result } = renderHook(() => useTwoFactorSettings());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    await act(async () => {
      await result.current.sendChallenge();
    });
    await act(async () => {
      await result.current.sendChallenge();
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  /**
   * 失敗したときもガードを外す。`finally` を `try` の中へ動かすと、
   * ネットワーク断の直後から操作不能になる。
   */
  it('送信が失敗しても次の送信は通る', async () => {
    mockFetch.mockImplementationOnce(statusResponse);

    const { result } = renderHook(() => useTwoFactorSettings());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      await result.current.sendChallenge();
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    await act(async () => {
      await result.current.sendChallenge();
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
