/**
 * @jest-environment node
 */

/**
 * 劇場公開中の人気映画APIクライアント テスト
 */

import { getNowShowingMovies } from './nowShowing';

// --- Mocks ---

const mockSelect = jest.fn();
const mockOrder = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
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

describe('getNowShowingMovies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
