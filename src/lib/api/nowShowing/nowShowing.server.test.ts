/**
 * @jest-environment node
 */

/**
 * 劇場公開中の人気映画API（サーバーサイド用） テスト
 */

import { getNowShowingMovies } from './nowShowing.server';

// --- Mocks ---

jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mockSelect = jest.fn();
const mockOrder = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: (columns: string) => {
        mockSelect(columns);
        return {
          order: (col: string, opts: { ascending: boolean }) => {
            mockOrder(col, opts);
            return Promise.resolve({
              data: [
                {
                  id: 'uuid-1',
                  tmdb_movie_id: 123,
                  title: 'Test Movie',
                  poster_path: '/poster.jpg',
                  release_date: '2026-03-01',
                  vote_average: 7.5,
                  popularity: 100,
                  display_order: 1,
                  fetched_at: '2026-03-14T00:00:00Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    }),
  }),
}));

// --- Tests ---

describe('getNowShowingMovies (server)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('display_order昇順で劇場公開中の人気映画を取得する', async () => {
    const result = await getNowShowingMovies();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Movie');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('display_order', {
      ascending: true,
    });
  });
});
