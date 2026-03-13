/**
 * @jest-environment node
 */

/**
 * ユーザー設定API テスト (GET / PUT)
 */

import {
  SETTINGS_ERROR_MESSAGES,
  SETTINGS_SUCCESS_MESSAGES,
  SUPABASE_ERROR_CODE,
} from '@/constants';

import { GET, PUT } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
const mockCreateServiceRoleClient = jest
  .fn()
  .mockReturnValue({ from: mockFrom });
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: (...args: unknown[]) =>
    mockCreateServiceRoleClient(...args),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createPutRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('GET /api/user/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('Supabaseクライアントがnullの場合500を返す', async () => {
    mockCreateServiceRoleClient.mockReturnValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('設定を取得できる', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { theme: 'dark', notification_enabled: true },
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      theme: 'dark',
      notificationEnabled: true,
    });
  });

  it('レコード未存在時はデフォルト値を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      theme: 'light',
      notificationEnabled: false,
    });
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('DBエラー時（data有り）に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { theme: 'light', notification_enabled: false },
            error: { code: 'OTHER_ERROR', message: 'DB error' },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.message).toBe(SETTINGS_ERROR_MESSAGES.FETCH_FAILED);
  });

  it('DBエラー時（data無し）はデフォルト値を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: 'OTHER_ERROR', message: 'DB error' },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      theme: 'light',
      notificationEnabled: false,
    });
  });
});

describe('PUT /api/user/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('Supabaseクライアントがnullの場合500を返す', async () => {
    mockCreateServiceRoleClient.mockReturnValueOnce(null);

    const response = await PUT(createPutRequest({ theme: 'dark' }));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('テーマを更新できる', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: null }),
    });

    const response = await PUT(createPutRequest({ theme: 'dark' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe(SETTINGS_SUCCESS_MESSAGES.UPDATED);
  });

  it('通知設定を更新できる', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: null }),
    });

    const response = await PUT(createPutRequest({ notificationEnabled: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('不正なテーマ値でバリデーションエラー400を返す', async () => {
    const response = await PUT(createPutRequest({ theme: 'invalid' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await PUT(createPutRequest({ theme: 'dark' }));

    expect(response.status).toBe(401);
  });

  it('DBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: new Error('Upsert failed') }),
    });

    const response = await PUT(createPutRequest({ theme: 'dark' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.message).toBe(SETTINGS_ERROR_MESSAGES.UPDATE_FAILED);
  });
});
