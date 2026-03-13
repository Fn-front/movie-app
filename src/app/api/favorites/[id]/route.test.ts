/**
 * @jest-environment node
 */

/**
 * お気に入り個別操作API Route テスト (PATCH / DELETE)
 */

import { FAVORITES_SUCCESS_MESSAGES } from '@/constants';

import { PATCH, DELETE } from './route';

// --- Constants ---

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '660e8400-e29b-41d4-a716-446655440001';

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

// --- Helpers ---

const createPatchRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost/api/favorites/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

const createDeleteRequest = (id: string) => ({
  request: new Request(`http://localhost/api/favorites/${id}`, {
    method: 'DELETE',
  }),
  params: Promise.resolve({ id }),
});

// --- PATCH Tests ---

describe('PATCH /api/favorites/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('評価を正常に更新できる', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => ({
                  data: {
                    id: VALID_UUID,
                    tmdb_movie_id: 12345,
                    title: 'テスト映画',
                    poster_path: '/test.jpg',
                    release_date: '2026-03-01',
                    rating: 7,
                    added_at: '2026-03-10T00:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { request, params } = createPatchRequest(VALID_UUID, { rating: 7 });
    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe(FAVORITES_SUCCESS_MESSAGES.UPDATED);
    expect(json.data.rating).toBe(7);
  });

  it('存在しないIDで404を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => ({
                  data: null,
                  error: { code: 'PGRST116' },
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { request, params } = createPatchRequest(OTHER_UUID, {
      rating: 5,
    });
    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('不正なID形式で400を返す', async () => {
    const { request, params } = createPatchRequest('invalid-id', {
      rating: 5,
    });
    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('バリデーションエラーで400を返す（rating範囲外）', async () => {
    const { request, params } = createPatchRequest(VALID_UUID, { rating: 11 });
    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('バリデーションエラーで400を返す（rating小数）', async () => {
    const { request, params } = createPatchRequest(VALID_UUID, {
      rating: 5.5,
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const { request, params } = createPatchRequest(VALID_UUID, { rating: 5 });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(401);
  });

  it('不正なJSONで400を返す', async () => {
    const request = new Request(
      `http://localhost/api/favorites/${VALID_UUID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      },
    );
    const params = Promise.resolve({ id: VALID_UUID });

    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('BAD_REQUEST');
  });

  it('予期しないDBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => {
        throw new Error('Unexpected DB error');
      },
    });

    const { request, params } = createPatchRequest(VALID_UUID, { rating: 5 });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(500);
  });
});

// --- DELETE Tests ---

describe('DELETE /api/favorites/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('正常に論理削除できる', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => ({
                  data: { id: VALID_UUID },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { request, params } = createDeleteRequest(VALID_UUID);
    const response = await DELETE(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe(FAVORITES_SUCCESS_MESSAGES.REMOVED);
  });

  it('存在しないIDで404を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => ({
                  data: null,
                  error: { code: 'PGRST116' },
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { request, params } = createDeleteRequest(OTHER_UUID);
    const response = await DELETE(request, { params });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('不正なID形式で400を返す', async () => {
    const { request, params } = createDeleteRequest('not-a-uuid');
    const response = await DELETE(request, { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('他ユーザーのお気に入りで404を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => ({
                  data: null,
                  error: { code: 'PGRST116' },
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { request, params } = createDeleteRequest(OTHER_UUID);
    const response = await DELETE(request, { params });

    expect(response.status).toBe(404);
  });

  it('既に削除済みの場合404を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => ({
                  data: null,
                  error: { code: 'PGRST116' },
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { request, params } = createDeleteRequest(OTHER_UUID);
    const response = await DELETE(request, { params });

    expect(response.status).toBe(404);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const { request, params } = createDeleteRequest(VALID_UUID);
    const response = await DELETE(request, { params });

    expect(response.status).toBe(401);
  });

  it('予期しないDBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => {
        throw new Error('Unexpected DB error');
      },
    });

    const { request, params } = createDeleteRequest(VALID_UUID);
    const response = await DELETE(request, { params });

    expect(response.status).toBe(500);
  });
});
