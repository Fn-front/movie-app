/**
 * confirmSignedOut のテスト
 *
 * 「ログアウト済み」と「応答を得られなかった」を区別できることが全て。
 * 区別を誤ると、取り消せない消去（同意レコード）が通信の都合で走る。
 */

import { confirmSignedOut } from './sessionProbe';

const mockFetch = jest.fn();

describe('confirmSignedOut', () => {
  // jsdom は fetch を持たないので spyOn できない。元の値を退避して必ず戻す。
  // 戻さないと、実 fetch を使うテストを後から足したときに黙って壊れる
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const response = (ok: boolean, body: unknown) =>
    ({ ok, json: async () => body }) as Response;

  it('セッションが無いと応答したら true', async () => {
    mockFetch.mockResolvedValue(response(true, null));

    await expect(confirmSignedOut()).resolves.toBe(true);
  });

  it('空オブジェクトで応答したら true', async () => {
    // NextAuth はセッションが無いとき {} を返すことがある
    mockFetch.mockResolvedValue(response(true, {}));

    await expect(confirmSignedOut()).resolves.toBe(true);
  });

  it('セッションがあると応答したら false', async () => {
    mockFetch.mockResolvedValue(response(true, { user: { id: 'user-1' } }));

    await expect(confirmSignedOut()).resolves.toBe(false);
  });

  it('無効化済みセッション（user.id が空文字）なら true', async () => {
    // パスワード変更・絶対期限切れは user を空文字で埋めて返る（#699）
    mockFetch.mockResolvedValue(response(true, { user: { id: '' } }));

    await expect(confirmSignedOut()).resolves.toBe(true);
  });

  it('サーバーエラーなら false（確認できていないので消させない）', async () => {
    mockFetch.mockResolvedValue(response(false, null));

    await expect(confirmSignedOut()).resolves.toBe(false);
  });

  it('通信に失敗したら false（確認できていないので消させない）', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(confirmSignedOut()).resolves.toBe(false);
  });

  it('本文が JSON として壊れていたら false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);

    await expect(confirmSignedOut()).resolves.toBe(false);
  });

  it('キャッシュを避けて取得する', async () => {
    mockFetch.mockResolvedValue(response(true, null));

    await confirmSignedOut();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('Cookie を載せて取得する', async () => {
    // 載せないと常に未認証と答えられ、「確認できた」として消去が走る
    mockFetch.mockResolvedValue(response(true, null));

    await confirmSignedOut();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('応答が返らない回線で待ち続けない', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockResolvedValue(response(true, null));

      await confirmSignedOut();

      const { signal } = mockFetch.mock.calls[0][1] as RequestInit;
      expect(signal?.aborted).toBe(false);

      jest.advanceTimersByTime(5000);

      expect(signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
