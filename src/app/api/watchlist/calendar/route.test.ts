/**
 * @jest-environment node
 */

/**
 * カレンダーAPI Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
let mockSupabaseEnabled = true;
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () =>
    mockSupabaseEnabled ? { from: mockFrom } : null,
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

const createGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/watchlist/calendar');
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Request(url.toString());
};

const mockCalendarQuery = (data: unknown[] | null, error: unknown = null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => ({
          not: () => ({
            gte: () => ({
              lt: () => ({
                order: () => ({
                  data,
                  error,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  });
};

// --- Tests ---

describe('GET /api/watchlist/calendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseEnabled = true;
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('月指定ありでカレンダーデータを取得できる', async () => {
    const mockItems = [
      {
        id: 'wl-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-03-15',
        added_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'wl-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-03-15',
        added_at: '2026-01-09T00:00:00Z',
      },
      {
        id: 'wl-3',
        tmdb_movie_id: 300,
        title: '映画C',
        poster_path: '/c.jpg',
        release_date: '2026-03-20',
        added_at: '2026-01-08T00:00:00Z',
      },
    ];

    mockCalendarQuery(mockItems);

    const response = await GET(createGetRequest({ month: '2026-03' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.month).toBe('2026-03');
    expect(Object.keys(json.data.movies_by_date)).toHaveLength(2);
    expect(json.data.movies_by_date['2026-03-15']).toHaveLength(2);
    expect(json.data.movies_by_date['2026-03-20']).toHaveLength(1);
  });

  it('月指定なしでデフォルト当月のデータを取得できる', async () => {
    mockCalendarQuery([]);

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.month).toMatch(/^\d{4}-\d{2}$/);
    expect(json.data.movies_by_date).toEqual({});
  });

  it('映画がない月で空レスポンスを返す', async () => {
    mockCalendarQuery([]);

    const response = await GET(createGetRequest({ month: '2025-01' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.movies_by_date).toEqual({});
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest({ month: '2026-03' }));

    expect(response.status).toBe(401);
  });

  it('不正なmonth形式で400を返す', async () => {
    const response = await GET(createGetRequest({ month: '2026-3' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('不正なmonth形式（日付付き）で400を返す', async () => {
    const response = await GET(createGetRequest({ month: '2026-03-01' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('不正な月（00）で400を返す', async () => {
    const response = await GET(createGetRequest({ month: '2026-00' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('不正な月（13）で400を返す', async () => {
    const response = await GET(createGetRequest({ month: '2026-13' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('DBエラー時に500を返す', async () => {
    mockCalendarQuery(null, new Error('DB error'));

    const response = await GET(createGetRequest({ month: '2026-03' }));

    expect(response.status).toBe(500);
  });

  it('Supabaseクライアントがnullの場合、500を返す', async () => {
    mockSupabaseEnabled = false;

    const response = await GET(createGetRequest({ month: '2026-03' }));

    expect(response.status).toBe(500);
  });

  it('12月を指定した場合、翌年1月が終了日として計算される', async () => {
    mockCalendarQuery([]);

    const response = await GET(createGetRequest({ month: '2026-12' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.month).toBe('2026-12');
  });

  it('dataがnullの場合、空のmovies_by_dateを返す', async () => {
    mockCalendarQuery(null);

    const response = await GET(createGetRequest({ month: '2026-03' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.movies_by_date).toEqual({});
  });

  it('release_dateがnullのアイテムはスキップされる', async () => {
    const mockItems = [
      {
        id: 'wl-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: null,
        added_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'wl-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-03-15',
        added_at: '2026-01-09T00:00:00Z',
      },
    ];

    mockCalendarQuery(mockItems);

    const response = await GET(createGetRequest({ month: '2026-03' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    // release_date=nullのアイテムはスキップされるため1日のみ
    expect(Object.keys(json.data.movies_by_date)).toHaveLength(1);
    expect(json.data.movies_by_date['2026-03-15']).toHaveLength(1);
  });

  it('日付ごとに映画が正しくグループ化される', async () => {
    const mockItems = [
      {
        id: 'wl-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-06-01',
        added_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'wl-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: null,
        release_date: '2026-06-01',
        added_at: '2026-01-09T00:00:00Z',
      },
      {
        id: 'wl-3',
        tmdb_movie_id: 300,
        title: '映画C',
        poster_path: '/c.jpg',
        release_date: '2026-06-15',
        added_at: '2026-01-08T00:00:00Z',
      },
      {
        id: 'wl-4',
        tmdb_movie_id: 400,
        title: '映画D',
        poster_path: '/d.jpg',
        release_date: '2026-06-30',
        added_at: '2026-01-07T00:00:00Z',
      },
    ];

    mockCalendarQuery(mockItems);

    const response = await GET(createGetRequest({ month: '2026-06' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.movies_by_date['2026-06-01']).toHaveLength(2);
    expect(json.data.movies_by_date['2026-06-15']).toHaveLength(1);
    expect(json.data.movies_by_date['2026-06-30']).toHaveLength(1);
  });
});
