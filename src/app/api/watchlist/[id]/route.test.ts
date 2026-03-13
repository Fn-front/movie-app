/**
 * @jest-environment node
 */

/**
 * ウォッチリスト削除API Route テスト (DELETE)
 */

import { WATCHLIST_SUCCESS_MESSAGES } from '@/constants';

import { DELETE } from './route';

// --- Constants ---

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '660e8400-e29b-41d4-a716-446655440001';

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

const createDeleteRequest = (id: string) => ({
  request: new Request(`http://localhost/api/watchlist/${id}`, {
    method: 'DELETE',
  }),
  params: Promise.resolve({ id }),
});

// --- Tests ---

describe('DELETE /api/watchlist/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('Supabaseクライアントがnullの場合500を返す', async () => {
    mockCreateServiceRoleClient.mockReturnValueOnce(null);

    const { request, params } = createDeleteRequest(VALID_UUID);
    const response = await DELETE(request, { params });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
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
    expect(json.message).toBe(WATCHLIST_SUCCESS_MESSAGES.REMOVED);
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

  it('他ユーザーのウォッチリストで404を返す', async () => {
    // user_idが一致しないのでsingle()がnullを返す
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
    // deleted_at IS NULLの条件でマッチしない
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
