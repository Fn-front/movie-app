/**
 * @jest-environment node
 */

/**
 * verifyCronAuth テスト
 */

import { verifyCronAuth } from './cronAuth';

describe('verifyCronAuth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('正しいBearerトークンでnullを返す', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer test-secret' },
    });

    expect(verifyCronAuth(request)).toBeNull();
  });

  it('不正なトークンで401レスポンスを返す', async () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    const response = verifyCronAuth(request)!;
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('Authorizationヘッダー未設定で401を返す', async () => {
    const request = new Request('http://localhost/api/cron/test');

    const response = verifyCronAuth(request)!;

    expect(response.status).toBe(401);
  });

  it('CRON_SECRET未設定で401を返す', async () => {
    delete process.env.CRON_SECRET;

    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = verifyCronAuth(request)!;

    expect(response.status).toBe(401);
  });
});
