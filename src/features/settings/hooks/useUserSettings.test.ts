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

  /**
   * 古い応答が新しい結果を上書きしない
   *
   * ⚠️ 「アンマウント後に setState しないこと」を React の警告で見る案は
   * 使えない。React 19 はその警告を**廃止している**ので、番兵を全部外しても
   * 素通りする（実際に外して確認済み）。観測できる状態で見る。
   *
   * ⚠️ 番兵は **effect ごとのローカル変数**でなければならない。`useRef` に
   * して実行のたびに false へ戻すと、cleanup が立てた旗が次の実行で消え、
   * ここが落ちる
   */
  it('前回の取得が遅れて失敗しても、新しい結果を上書きしない', async () => {
    let rejectFirst: (reason: unknown) => void = () => {};
    mockGetSettings.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );

    const { result } = renderHook(() => useUserSettings());

    // 1回目が宙に浮いたまま retry（2回目は即座に成功する）
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.settings).toEqual(SETTINGS));

    // ここで1回目が失敗して返ってくる
    await act(async () => {
      rejectFirst(new Error('late failure'));
    });

    expect(result.current.settings).toEqual(SETTINGS);
    expect(result.current.hasFailed).toBe(false);
  });
});
