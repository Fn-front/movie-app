/**
 * @jest-environment node
 */

/**
 * ウォッチリスト削除API Route テスト (DELETE)
 */

import { DELETE } from './route';

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

  it('正常に論理削除できる', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => ({
                  data: { id: 'wl-123' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { request, params } = createDeleteRequest('wl-123');
    const response = await DELETE(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('ウォッチリストから削除しました');
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

    const { request, params } = createDeleteRequest('non-existent');
    const response = await DELETE(request, { params });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
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

    const { request, params } = createDeleteRequest('other-user-wl');
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

    const { request, params } = createDeleteRequest('deleted-wl');
    const response = await DELETE(request, { params });

    expect(response.status).toBe(404);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const { request, params } = createDeleteRequest('wl-123');
    const response = await DELETE(request, { params });

    expect(response.status).toBe(401);
  });

  it('予期しないDBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => {
        throw new Error('Unexpected DB error');
      },
    });

    const { request, params } = createDeleteRequest('wl-123');
    const response = await DELETE(request, { params });

    expect(response.status).toBe(500);
  });
});
