/**
 * @jest-environment node
 */

/**
 * フィルター条件保存API Route テスト
 */

import { GET, PUT } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
const mockCreateServiceRoleClient = jest.fn();
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

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Tests ---

describe('GET /api/filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
    mockCreateServiceRoleClient.mockReturnValue({ from: mockFrom });
  });

  it('保存済みフィルターを取得できる', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { filter_conditions: { sort_by: 'popularity' } },
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.filter_conditions).toEqual({ sort_by: 'popularity' });
  });

  it('フィルターが未保存の場合は空オブジェクトを返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.filter_conditions).toEqual({});
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('Supabaseクライアントがnullの場合500を返す', async () => {
    mockCreateServiceRoleClient.mockReturnValue(null);

    const response = await GET();
    expect(response.status).toBe(500);
  });

  it('PGRST116以外のDBエラーで500を返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: 'SOME_OTHER_ERROR', message: 'DB failure' },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    (console.error as jest.Mock).mockRestore();
  });
});

describe('PUT /api/filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
    mockCreateServiceRoleClient.mockReturnValue({ from: mockFrom });
  });

  it('フィルター条件を保存できる', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: null }),
    });

    const request = new Request('http://localhost/api/filters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_by: 'popularity' }),
    });

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const request = new Request('http://localhost/api/filters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_by: 'popularity' }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(401);
  });

  it('upsertエラーで500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: new Error('DB error') }),
    });

    const request = new Request('http://localhost/api/filters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_by: 'popularity' }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(500);
  });

  it('Supabaseクライアントがnullの場合500を返す', async () => {
    mockCreateServiceRoleClient.mockReturnValue(null);

    const request = new Request('http://localhost/api/filters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_by: 'popularity' }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(500);
  });

  it('バリデーションエラーで400を返す', async () => {
    const request = new Request('http://localhost/api/filters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_by: 'invalid_value' }),
    });

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBeDefined();
    expect(json.error.details).toBeDefined();
  });
  describe('レート制限', () => {
    /** PUT 用の最小リクエスト */
    const createPutRequest = () =>
      new Request('http://localhost/api/filters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_by: 'popularity' }),
      });

    it('GET: 上限超過で429を返し、DBを読まない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await GET();

      expect(response.status).toBe(429);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('GET: 読み取り用の read_api_user_data として数える', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({ single: () => ({ data: null, error: null }) }),
        }),
      });

      await GET();

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-123',
        'read_api_user_data',
        120,
        10,
      );
    });

    it('PUT: 上限超過で429を返し、保存しない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await PUT(createPutRequest());

      expect(response.status).toBe(429);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('PUT: 書き込み用の write_api_filters として数える', async () => {
      mockFrom.mockReturnValue({ upsert: () => ({ error: null }) });

      await PUT(createPutRequest());

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-123',
        'write_api_filters',
        10,
        1,
      );
    });
  });
});
