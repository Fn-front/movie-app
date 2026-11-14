/**
 * 設定の読み取りフックのテスト（#1163）
 */

import { act, renderHook, waitFor } from '@testing-library/react';

const mockGetSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

import { useUserSettings } from './useUserSettings';

const SETTINGS = {
  theme: 'light',
  notificationEnabled: true,
  streamingNoticeScope: 'flatrate',
};

describe('useUserSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue(SETTINGS);
  });

  it('取得できたら settings に入れ、失敗扱いにしない', async () => {
    const { result } = renderHook(() => useUserSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(SETTINGS);
    expect(result.current.hasFailed).toBe(false);
  });

  /**
   * 失敗を既定値で埋めない（#1163）
   *
   * ここで `settings` に既定値を入れてしまうと、呼び出し側は
   * 「読めなかった」と「オフだった」を区別できなくなる。null のままにして
   * 判断を呼び出し側へ残す
   */
  it('失敗したら settings を埋めず hasFailed を立てる', async () => {
    mockGetSettings.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useUserSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toBeNull();
    expect(result.current.hasFailed).toBe(true);
  });

  it('retry で読み直し、成功したら失敗状態が解ける', async () => {
    mockGetSettings.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.hasFailed).toBe(true));

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.hasFailed).toBe(false));
    expect(result.current.settings).toEqual(SETTINGS);
  });

  it('アンマウント後の応答では状態を更新しない', async () => {
    let resolveFn: (value: unknown) => void = () => {};
    mockGetSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useUserSettings());
    unmount();

    await act(async () => {
      resolveFn(SETTINGS);
    });

    // React は解放済みコンポーネントへの setState を警告する。
    // 出ていなければ取りこぼしていない
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
