/**
 * @jest-environment node
 */

/**
 * 原題提案API Route テスト
 */

import { GET } from './route';

// --- Mocks ---

const mockGetAuthSession = jest.fn();
jest.mock('@/helpers/auth', () => ({
  getAuthSession: (...args: unknown[]) => mockGetAuthSession(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockFrom = jest.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
}));

jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

const mockFetchTitleSuggestion = jest.fn();
jest.mock('@/lib/openai/suggestTitle', () => ({
  fetchTitleSuggestionFromOpenAI: (...args: unknown[]) =>
    mockFetchTitleSuggestion(...args),
}));

// --- Helpers ---

function createRequest(query?: string): Request {
  const url = query
    ? `http://localhost/api/movies/suggest-title?query=${encodeURIComponent(query)}`
    : 'http://localhost/api/movies/suggest-title';
  return new Request(url);
}

// --- Tests ---

describe('GET /api/movies/suggest-title', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockSingle.mockResolvedValue({ data: null, error: null });
  });

  it('未認証の場合401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await GET(createRequest('テスト'));
    expect(response.status).toBe(401);
  });

  it('queryが未指定の場合400を返す', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('キャッシュヒット時にDBの結果を返す', async () => {
    mockSingle.mockResolvedValue({
      data: { suggested_title: 'The Shawshank Redemption' },
      error: null,
    });

    const response = await GET(createRequest('ショーシャンクの空に'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.suggestion).toBe('The Shawshank Redemption');
    expect(body.data.cached).toBe(true);
    expect(mockFetchTitleSuggestion).not.toHaveBeenCalled();
  });

  it('キャッシュミス時にOpenAI APIを呼び出して結果を返す', async () => {
    mockFetchTitleSuggestion.mockResolvedValue('The Shawshank Redemption');

    const response = await GET(createRequest('ショーシャンクの空に'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.suggestion).toBe('The Shawshank Redemption');
    expect(body.data.cached).toBe(false);
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        query_title: 'ショーシャンクの空に',
        suggested_title: 'The Shawshank Redemption',
      },
      { onConflict: 'query_title' },
    );
  });

  it('OpenAIがnullを返した場合は提案なしを返す', async () => {
    mockFetchTitleSuggestion.mockResolvedValue(null);

    const response = await GET(createRequest('asdfjkl'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.suggestion).toBeNull();
    expect(body.data.cached).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('予期しないエラーで500を返す', async () => {
    mockSingle.mockRejectedValue(new Error('DB error'));

    const response = await GET(createRequest('テスト'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('SERVER_ERROR');
  });
});
