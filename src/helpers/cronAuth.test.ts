/**
 * @jest-environment node
 */

/**
 * verifyCronAuth テスト
 */

// --- Mocks ---

/**
 * ⚠️ 通知をモックする（#979）。
 * モックしないと **実際に Resend API を叩く**。jest は next/jest 経由で
 * `.env.local` を読むので、手元では本物のメールが飛ぶ。
 */
const mockNotifyCronFailure = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/cron/notifyCronFailure', () => ({
  notifyCronFailure: (...args: unknown[]) => mockNotifyCronFailure(...args),
}));

const mockCreateServiceRoleClient = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

import { verifyCronAuth } from './cronAuth';

describe('verifyCronAuth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifyCronFailure.mockResolvedValue(true);
    mockCreateServiceRoleClient.mockReturnValue({});
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('正しいBearerトークンでnullを返す', async () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer test-secret' },
    });

    await expect(verifyCronAuth(request, 'test')).resolves.toBeNull();
  });

  it('不正なトークンで401レスポンスを返す', async () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    const response = (await verifyCronAuth(request, 'test'))!;
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('Authorizationヘッダー未設定で401を返す', async () => {
    const request = new Request('http://localhost/api/cron/test');

    const response = (await verifyCronAuth(request, 'test'))!;

    expect(response.status).toBe(401);
  });

  it('CRON_SECRET未設定で401を返す', async () => {
    delete process.env.CRON_SECRET;

    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = (await verifyCronAuth(request, 'test'))!;

    expect(response.status).toBe(401);
  });

  /**
   * ⚠️ ここが #979 の主要シナリオ。
   *
   * 401 は `return` されるので CRON 側の catch に入らない。通知を
   * `verifyCronAuth` の中に置かないと、**全 CRON が 401 で素通りしている
   * 状態に誰も気づけない**（画面は正常に見える）。
   */
  describe('通知（#979）', () => {
    it('CRON_SECRET が未設定なら通知する', async () => {
      delete process.env.CRON_SECRET;

      const request = new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer test-secret' },
      });

      await verifyCronAuth(request, 'sync-movies');

      expect(mockNotifyCronFailure).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          cronName: 'sync-movies',
          reason: expect.stringContaining('CRON_SECRET'),
        }),
      );
    });

    it('Authorization ヘッダーが無くても CRON_SECRET 未設定なら通知する', async () => {
      delete process.env.CRON_SECRET;

      const request = new Request('http://localhost/api/cron/test');

      await verifyCronAuth(request, 'sync-movies');

      expect(mockNotifyCronFailure).toHaveBeenCalledTimes(1);
    });

    /**
     * ⛔ **不一致では通知しない。**
     *
     * `/api/cron/*` は未認証で誰でも叩ける。不一致で通知すると外部から
     * 通知を誘発でき、1日1通の連投抑止と相まって**その日の通知枠を
     * 使い切らせて本物の失敗を埋もれさせられる**。
     *
     * この期待を消すと、アラートを無力化できる状態に戻る。
     */
    it('トークンが不一致でも通知しない（外部から誘発できるため）', async () => {
      const request = new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer wrong-secret' },
      });

      const response = (await verifyCronAuth(request, 'sync-movies'))!;

      expect(response.status).toBe(401);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });

    it('Authorization ヘッダーが無いだけなら通知しない', async () => {
      const request = new Request('http://localhost/api/cron/test');

      const response = (await verifyCronAuth(request, 'sync-movies'))!;

      expect(response.status).toBe(401);
      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });

    it('認証に成功したら通知しない', async () => {
      const request = new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer test-secret' },
      });

      await verifyCronAuth(request, 'sync-movies');

      expect(mockNotifyCronFailure).not.toHaveBeenCalled();
    });
  });
});
