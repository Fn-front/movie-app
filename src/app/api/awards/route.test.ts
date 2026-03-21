/**
 * @jest-environment node
 */

/**
 * 受賞作品API Route テスト
 */

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
  dbConnectionErrorResponse: jest.fn(
    () => new Response(JSON.stringify({ success: false }), { status: 500 }),
  ),
}));

jest.mock('@/helpers/routeError', () => ({
  handleRouteError: jest.fn(
    (_error: unknown, _prefix: string, message: string) =>
      new Response(JSON.stringify({ success: false, error: { message } }), {
        status: 500,
      }),
  ),
}));

import { GET } from './route';

// --- Helpers ---

function createRequest(yearParam?: string): Request {
  const url = yearParam
    ? `http://localhost/api/awards?year=${yearParam}`
    : 'http://localhost/api/awards';
  return new Request(url);
}

function mockYearQuery(years: number[]) {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      order: () =>
        Promise.resolve({
          data: years.map((y) => ({ award_year: y })),
          error: null,
        }),
    }),
  });
}

function mockAwardDataQuery(rows: Record<string, unknown>[]) {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  });
}

// --- Tests ---

describe('GET /api/awards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('yearパラメータなしの場合400を返す', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('yearが数値でない場合400を返す', async () => {
    const response = await GET(createRequest('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('正常にデータを取得する', async () => {
    mockYearQuery([2026, 2025]);
    mockAwardDataQuery([
      {
        tmdb_movie_id: 100,
        title: 'テスト映画',
        poster_path: '/poster.jpg',
        release_date: '2025-12-01',
        vote_average: 8.5,
        genre_ids: [18],
        award_name: 'academy_awards',
        award_year: 2026,
        category: 'best_picture',
        award_label: '作品賞',
        is_winner: true,
        display_order: 1,
      },
    ]);

    const response = await GET(createRequest('2026'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.year).toBe(2026);
    expect(body.data.availableYears).toEqual([2026, 2025]);
    expect(body.data.awards).toHaveLength(1);
    expect(body.data.awards[0].awardName).toBe('academy_awards');
    expect(body.data.awards[0].categories).toHaveLength(1);
    expect(body.data.awards[0].categories[0].winner).not.toBeNull();
    expect(body.data.awards[0].categories[0].winner.tmdbMovieId).toBe(100);
  });

  it('データがない年度は空のawards配列を返す', async () => {
    mockYearQuery([2026]);
    mockAwardDataQuery([]);

    const response = await GET(createRequest('2025'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.awards).toEqual([]);
  });

  it('受賞者とノミネートが正しく分離される', async () => {
    mockYearQuery([2026]);
    mockAwardDataQuery([
      {
        tmdb_movie_id: 100,
        title: '受賞映画',
        poster_path: '/winner.jpg',
        release_date: '2025-12-01',
        vote_average: 8.5,
        genre_ids: [18],
        award_name: 'academy_awards',
        award_year: 2026,
        category: 'best_picture',
        award_label: '作品賞',
        is_winner: true,
        display_order: 1,
      },
      {
        tmdb_movie_id: 200,
        title: 'ノミネート映画',
        poster_path: '/nominee.jpg',
        release_date: '2025-11-01',
        vote_average: 7.5,
        genre_ids: [18],
        award_name: 'academy_awards',
        award_year: 2026,
        category: 'best_picture',
        award_label: '作品賞',
        is_winner: false,
        display_order: 2,
      },
    ]);

    const response = await GET(createRequest('2026'));
    const body = await response.json();

    const category = body.data.awards[0].categories[0];
    expect(category.winner.tmdbMovieId).toBe(100);
    expect(category.nominees).toHaveLength(2);
  });

  it('AWARD_DEFINITIONSの定義順でカテゴリが返される', async () => {
    mockYearQuery([2026]);
    // best_directorを先にDBから返しても、best_pictureが先に来ること
    mockAwardDataQuery([
      {
        tmdb_movie_id: 200,
        title: '監督映画',
        poster_path: null,
        release_date: '2025-12-01',
        vote_average: 8.0,
        genre_ids: [18],
        award_name: 'academy_awards',
        award_year: 2026,
        category: 'best_director',
        award_label: '監督賞',
        is_winner: true,
        display_order: 1,
      },
      {
        tmdb_movie_id: 100,
        title: '作品映画',
        poster_path: null,
        release_date: '2025-12-01',
        vote_average: 8.5,
        genre_ids: [18],
        award_name: 'academy_awards',
        award_year: 2026,
        category: 'best_picture',
        award_label: '作品賞',
        is_winner: true,
        display_order: 1,
      },
    ]);

    const response = await GET(createRequest('2026'));
    const body = await response.json();

    const categories = body.data.awards[0].categories;
    expect(categories[0].category).toBe('best_picture');
    expect(categories[1].category).toBe('best_director');
  });

  it('availableYearsが重複なしで返される', async () => {
    // 同じ年度が複数レコードに存在する場合
    mockYearQuery([2026, 2026, 2025, 2025, 2024]);
    mockAwardDataQuery([]);

    const response = await GET(createRequest('2026'));
    const body = await response.json();

    expect(body.data.availableYears).toEqual([2026, 2025, 2024]);
  });

  it('DB接続エラー時は500を返す', async () => {
    const { createServiceRoleClient } = await import('@/helpers/supabase');
    (createServiceRoleClient as jest.Mock).mockReturnValueOnce(null);

    const response = await GET(createRequest('2026'));
    expect(response.status).toBe(500);
  });
});
