/**
 * @jest-environment node
 */

import { deleteStaleAwardRows } from './deleteStaleAwardRows';

// --- Helpers ---

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
      categories: ['best_picture'],
    });

    expect(result).toBeNull();
    expect(from).toHaveBeenCalledWith('award_movies');
    expect(eqName).toHaveBeenCalledWith('award_name', 'academy_awards');
    expect(eqYear).toHaveBeenCalledWith('award_year', 2026);
    expect(inCategories).toHaveBeenCalledWith('category', ['best_picture']);
    expect(lt).toHaveBeenCalledWith('generated_at', '2026-11-04T00:00:00.000Z');
  });

  it('渡された部門だけを削除対象にする', async () => {
    // 呼び出し元が取りこぼした部門を除外済み。ここはその集合をそのまま使う
    const { supabase, inCategories } = createSupabase();

    await deleteStaleAwardRows(supabase, {
      ...params,
      categories: ['best_picture', 'best_actor'],
    });

    expect(inCategories).toHaveBeenCalledWith('category', [
      'best_picture',
      'best_actor',
    ]);
  });

  it('削除してよい部門が0件なら何も削除しない', async () => {
    const { supabase, del } = createSupabase();

    const result = await deleteStaleAwardRows(supabase, {
      ...params,
      categories: [],
    });

    expect(result).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it('削除に失敗したらエラーをそのまま返す', async () => {
    // code / details / hint まで残す。無人ジョブの事後調査で
    // 42501（権限）と 57014（タイムアウト）を見分けられなくなるため
    const error = {
      message: 'delete boom',
      code: '57014',
      details: '',
      hint: '',
      name: 'PostgrestError',
    };
    const { supabase } = createSupabase(error);

    const result = await deleteStaleAwardRows(supabase, {
      ...params,
      categories: ['best_picture'],
    });

    expect(result).toEqual(error);
  });
});
