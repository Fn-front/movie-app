/**
 * @jest-environment node
 */

/**
 * フィルター条件保存API Route テスト
 */

import { GET, PUT } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Tests ---

describe('GET /api/filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
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
});

describe('PUT /api/filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
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
});
