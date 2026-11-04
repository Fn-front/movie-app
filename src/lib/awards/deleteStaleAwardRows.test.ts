/**
 * @jest-environment node
 */

import { deleteStaleAwardRows } from './deleteStaleAwardRows';
import type { AwardMovieRow } from './syncAwardMoviesService';

// --- Helpers ---

function createRow(overrides: Partial<AwardMovieRow> = {}): AwardMovieRow {
  return {
    tmdb_movie_id: 1,
    title: 'テスト映画',
    poster_path: null,
    release_date: null,
    vote_average: null,
    vote_count: 0,
    genre_ids: null,
    award_name: 'academy_awards',
    award_year: 2026,
    category: 'best_picture',
    is_winner: false,
    display_order: 1,
    person_name: null,
    generated_at: '2026-11-04T00:00:00.000Z',
    ...overrides,
  };
}

/** award_movies の DELETE チェーンをモックする */
function createSupabase(deleteError: { message: string } | null = null) {
  const lt = jest.fn().mockResolvedValue({ error: deleteError });
  const inCategories = jest.fn(() => ({ lt }));
  const eqYear = jest.fn(() => ({ in: inCategories }));
  const eqName = jest.fn(() => ({ eq: eqYear }));
  const del = jest.fn(() => ({ eq: eqName }));
  const from = jest.fn(() => ({ delete: del }));

  return {
    supabase: { from } as unknown as Parameters<typeof deleteStaleAwardRows>[0],
    from,
    del,
    eqName,
    eqYear,
    inCategories,
    lt,
  };
}

const params = {
  awardName: 'academy_awards',
  year: 2026,
  generatedAt: '2026-11-04T00:00:00.000Z',
};

// --- Tests ---

describe('deleteStaleAwardRows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('賞・年・部門・generated_at で絞って削除する', async () => {
    const { supabase, from, eqName, eqYear, inCategories, lt } =
      createSupabase();

    const result = await deleteStaleAwardRows(supabase, {
      ...params,
      rows: [createRow()],
    });

    expect(result).toBeNull();
    expect(from).toHaveBeenCalledWith('award_movies');
    expect(eqName).toHaveBeenCalledWith('award_name', 'academy_awards');
    expect(eqYear).toHaveBeenCalledWith('award_year', 2026);
    expect(inCategories).toHaveBeenCalledWith('category', ['best_picture']);
    expect(lt).toHaveBeenCalledWith('generated_at', '2026-11-04T00:00:00.000Z');
  });

  it('今回取得できた部門だけを削除対象にする', async () => {
    // 取得できなかった部門（best_director）は対象に含めない。
    // 含めると、一部ページだけ落ちた取得で既存行が全滅する
    const { supabase, inCategories } = createSupabase();

    await deleteStaleAwardRows(supabase, {
      ...params,
      rows: [
        createRow({ category: 'best_picture' }),
        createRow({ tmdb_movie_id: 2, category: 'best_picture' }),
        createRow({ tmdb_movie_id: 3, category: 'best_actor' }),
      ],
    });

    const [column, categories] = inCategories.mock.calls[0] as unknown as [
      string,
      string[],
    ];
    expect(column).toBe('category');
    expect([...categories].sort()).toEqual(['best_actor', 'best_picture']);
  });

  it('行が0件なら何も削除しない', async () => {
    const { supabase, del } = createSupabase();

    const result = await deleteStaleAwardRows(supabase, {
      ...params,
      rows: [],
    });

    expect(result).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it('削除に失敗したらエラーメッセージを返す', async () => {
    const { supabase } = createSupabase({ message: 'delete boom' });

    const result = await deleteStaleAwardRows(supabase, {
      ...params,
      rows: [createRow()],
    });

    expect(result).toEqual({ message: 'delete boom' });
  });
});
