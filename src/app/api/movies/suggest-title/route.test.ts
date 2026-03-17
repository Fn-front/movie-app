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

const mockFetchTitleSuggestions = jest.fn();
jest.mock('@/lib/openai/suggestTitle', () => ({
  fetchTitleSuggestionsFromOpenAI: (...args: unknown[]) =>
    mockFetchTitleSuggestions(...args),
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
      data: { suggestions: ['The Shawshank Redemption', 'Shawshank'] },
      error: null,
    });

    const response = await GET(createRequest('ショーシャンクの空に'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.suggestions).toEqual([
      'The Shawshank Redemption',
      'Shawshank',
    ]);
    expect(body.data.cached).toBe(true);
    expect(mockFetchTitleSuggestions).not.toHaveBeenCalled();
  });

  it('キャッシュミス時にOpenAI APIを呼び出して結果を返す', async () => {
    mockFetchTitleSuggestions.mockResolvedValue([
      'The Shawshank Redemption',
      'Shawshank',
    ]);

    const response = await GET(createRequest('ショーシャンクの空に'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.suggestions).toEqual([
      'The Shawshank Redemption',
      'Shawshank',
    ]);
    expect(body.data.cached).toBe(false);
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        query_title: 'ショーシャンクの空に',
        suggestions: ['The Shawshank Redemption', 'Shawshank'],
      },
      { onConflict: 'query_title' },
    );
  });

  it('OpenAIが空配列を返した場合は提案なしを返しDBにもキャッシュする', async () => {
    mockFetchTitleSuggestions.mockResolvedValue([]);

    const response = await GET(createRequest('asdfjkl'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.suggestions).toEqual([]);
    expect(body.data.cached).toBe(false);
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        query_title: 'asdfjkl',
        suggestions: [],
      },
      { onConflict: 'query_title' },
    );
  });

  it('提案なし（空配列）のキャッシュヒット時に空配列を返す', async () => {
    mockSingle.mockResolvedValue({
      data: { suggestions: [] },
      error: null,
    });

    const response = await GET(createRequest('asdfjkl'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.suggestions).toEqual([]);
    expect(body.data.cached).toBe(true);
    expect(mockFetchTitleSuggestions).not.toHaveBeenCalled();
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
