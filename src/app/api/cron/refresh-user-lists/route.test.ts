/**
 * @jest-environment node
 */

/**
 * 利用者リストの作品情報 取り直しCron API テスト (GET)（#433）
 */

import { NextRequest } from 'next/server';

import { GET } from './route';

// --- Mocks ---

/**
 * ⚠️ 通知をモックする（#979）。
 *
 * モックしないと `handleCronError` から **実際に Resend API を叩く**。
 * jest は next/jest 経由で `.env.local` を読むので、`RESEND_API_KEY` と
 * `CRON_ALERT_EMAIL` が入っている手元では**本物のメールが飛ぶ**。
 */
const mockNotifyCronFailure = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/cron/notifyCronFailure', () => ({
  notifyCronFailure: (...args: unknown[]) => mockNotifyCronFailure(...args),
}));

const mockVerifyCronAuth = jest.fn();
jest.mock('@/helpers/cronAuth', () => ({
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

const mockRefreshUserListTmdbFields = jest.fn();
jest.mock('@/lib/sync/refreshUserListTmdbFields', () => ({
  refreshUserListTmdbFields: (...args: unknown[]) =>
    mockRefreshUserListTmdbFields(...args),
}));

// --- Helpers ---

const createRequest = () =>
  new NextRequest('http://localhost/api/cron/refresh-user-lists');

const refreshResult = (overrides: Record<string, unknown> = {}) => ({
  tables: [
    {
      name: 'favorites',
      scanned: 160,
      refreshed: 158,
      markedDeleted: 2,
      truncated: false,
    },
  ],
  fromCache: 25,
  fromTmdb: 135,
  tmdbRequests: 135,
  durationMs: 4200,
  errors: [],
  items: { attempted: 135, failed: 0 },
  ...overrides,
});

// --- Tests ---

describe('GET /api/cron/refresh-user-lists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockRefreshUserListTmdbFields.mockResolvedValue(refreshResult());
  });

  it('取り直しの結果を返す', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.fromCache).toBe(25);
    expect(body.data.fromTmdb).toBe(135);
    expect(body.data.tables[0].markedDeleted).toBe(2);
  });

  it('認証に失敗したらそのレスポンスを返す', async () => {
    mockVerifyCronAuth.mockReturnValue(
      new Response(JSON.stringify({ success: false }), { status: 401 }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mockRefreshUserListTmdbFields).not.toHaveBeenCalled();
  });

  it('取り直しが失敗したら500を返し通知する', async () => {
    mockRefreshUserListTmdbFields.mockRejectedValue(new Error('boom'));

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    // ⚠️ 500 を返すだけで終わらせない（#979）
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'refresh-user-lists' }),
    );
  });

  /**
   * ⚠️ **ほぼ全滅でも 200 / `success: true`**（#1354 と同じ形）。
   *
   * 作品単位に catch して続ける設計なので、ステータスコードでは区別が
   * つかない。取り直せていない状態は規約違反が残っている状態なので、
   * 人に届くかどうかだけを変えている。
   */
  describe('ほぼ全滅したときの通知', () => {
    it('全件失敗したら通知する', async () => {
      mockRefreshUserListTmdbFields.mockResolvedValue(
        refreshResult({
          items: { attempted: 10, failed: 10 },
          errors: ['boom'],
        }),
      );

      const response = await GET(createRequest());

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ cronName: 'refresh-user-lists' }),
      );
    });

    // ⚠️ 作品側の事情で数件落ちるのは日常。ここで鳴ると無視されるようになる
    it('数件の失敗では通知しない', async () => {
      mockRefreshUserListTmdbFields.mockResolvedValue(
        refreshResult({
          items: { attempted: 100, failed: 3 },
          errors: ['boom'],
        }),
      );

      const response = await GET(createRequest());

      expect(response.status).toBe(200);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });
  });
});
