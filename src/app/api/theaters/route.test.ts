/**
 * @jest-environment node
 */

/**
 * 劇場一覧API Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();
const mockOrder = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect,
}));

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

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createGetRequest = () => new Request('http://localhost/api/theaters');

function setupChain(data: unknown[] | null, error: unknown = null) {
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ is: mockIs });
  mockIs.mockReturnValue({ order: mockOrder });
  mockOrder.mockResolvedValue({ data, error });
}

// --- Tests ---

describe('GET /api/theaters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('劇場一覧を取得できる', async () => {
    const mockTheaters = [
      {
        id: 'uuid-1',
        name: '汎用中規模シアター',
        slug: 'standard-medium',
        format: 'standard',
        audio_layout: 'atmos_9_1_6',
        description: 'テスト劇場',
      },
    ];

    setupChain(mockTheaters);

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.theaters).toEqual(mockTheaters);
  });

  it('Cache-Controlヘッダーが設定される', async () => {
    setupChain([]);

    const response = await GET(createGetRequest());

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
  });

  it('未認証時は401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
  });

  it('DBエラー時は500を返す', async () => {
    setupChain(null, new Error('DB error'));

    const response = await GET(createGetRequest());

    expect(response.status).toBe(500);
  });

  it('空の一覧を正常に返す', async () => {
    setupChain([]);

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.theaters).toEqual([]);
  });

  it('レート制限超過時は429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 60,
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.details.retryAfter).toBe(60);
  });
});
