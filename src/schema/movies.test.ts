/**
 * 映画関連バリデーションスキーマのテスト
 */

import { SEARCH_VALIDATION } from '@/constants';

import { moviesQuerySchema } from './movies';

describe('moviesQuerySchema', () => {
  describe('page', () => {
    it('デフォルト値が1であること', () => {
      const result = moviesQuerySchema.parse({});
      expect(result.page).toBe(1);
    });

    it('有効なページ番号を受け入れること', () => {
      const result = moviesQuerySchema.parse({ page: '5' });
      expect(result.page).toBe(5);
    });

    it('数値のページ番号を受け入れること', () => {
      const result = moviesQuerySchema.parse({ page: 10 });
      expect(result.page).toBe(10);
    });

    it('0以下のページ番号を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ page: '0' });
      expect(result.success).toBe(false);
    });

    it('負のページ番号を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ page: '-1' });
      expect(result.success).toBe(false);
    });

    it('500を超えるページ番号を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ page: '501' });
      expect(result.success).toBe(false);
    });

    it('500のページ番号を受け入れること', () => {
      const result = moviesQuerySchema.parse({ page: '500' });
      expect(result.page).toBe(500);
    });

    it('小数のページ番号を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ page: '1.5' });
      expect(result.success).toBe(false);
    });
  });

  describe('sort_by', () => {
    it('デフォルト値がrelease_dateであること', () => {
      const result = moviesQuerySchema.parse({});
      expect(result.sort_by).toBe('release_date');
    });

    it('release_dateを受け入れること', () => {
      const result = moviesQuerySchema.parse({ sort_by: 'release_date' });
      expect(result.sort_by).toBe('release_date');
    });

    it('popularityを受け入れること', () => {
      const result = moviesQuerySchema.parse({ sort_by: 'popularity' });
      expect(result.sort_by).toBe('popularity');
    });

    it('vote_averageを受け入れること', () => {
      const result = moviesQuerySchema.parse({ sort_by: 'vote_average' });
      expect(result.sort_by).toBe('vote_average');
    });

    it('無効なソート値を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ sort_by: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('release_type', () => {
    it('デフォルト値がtheatricalであること', () => {
      const result = moviesQuerySchema.parse({});
      expect(result.release_type).toBe('theatrical');
    });

    it('theatricalを受け入れること', () => {
      const result = moviesQuerySchema.parse({ release_type: 'theatrical' });
      expect(result.release_type).toBe('theatrical');
    });

    it('streamingを受け入れること', () => {
      const result = moviesQuerySchema.parse({ release_type: 'streaming' });
      expect(result.release_type).toBe('streaming');
    });

    it('無効なリリースタイプを拒否すること', () => {
      const result = moviesQuerySchema.safeParse({
        release_type: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('genre_ids', () => {
    it('デフォルトでundefinedであること', () => {
      const result = moviesQuerySchema.parse({});
      expect(result.genre_ids).toBeUndefined();
    });

    it('カンマ区切りの文字列を数値配列に変換すること', () => {
      const result = moviesQuerySchema.parse({ genre_ids: '28,12,878' });
      expect(result.genre_ids).toEqual([28, 12, 878]);
    });

    it('単一のジャンルIDを数値配列に変換すること', () => {
      const result = moviesQuerySchema.parse({ genre_ids: '28' });
      expect(result.genre_ids).toEqual([28]);
    });

    it('数値以外を含む値を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: '1,foo,3' });
      expect(result.success).toBe(false);
    });

    it('空文字を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: '' });
      expect(result.success).toBe(false);
    });

    it('末尾がカンマの値を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: '28,' });
      expect(result.success).toBe(false);
    });

    it('先頭がカンマの値を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: ',28' });
      expect(result.success).toBe(false);
    });

    it('カンマが連続する値を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: '28,,12' });
      expect(result.success).toBe(false);
    });

    it('負の数を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: '-28' });
      expect(result.success).toBe(false);
    });

    it('小数を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: '28.5' });
      expect(result.success).toBe(false);
    });

    it('空白を含む値を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ genre_ids: '28, 12' });
      expect(result.success).toBe(false);
    });

    it(`上限（${SEARCH_VALIDATION.MAX_GENRE_IDS}件）ちょうどを受け入れること`, () => {
      const genre_ids = Array.from(
        { length: SEARCH_VALIDATION.MAX_GENRE_IDS },
        (_, i) => i + 1,
      ).join(',');
      const result = moviesQuerySchema.parse({ genre_ids });
      expect(result.genre_ids).toHaveLength(SEARCH_VALIDATION.MAX_GENRE_IDS);
    });

    it(`上限（${SEARCH_VALIDATION.MAX_GENRE_IDS}件）を超える指定を拒否すること`, () => {
      const genre_ids = Array.from(
        { length: SEARCH_VALIDATION.MAX_GENRE_IDS + 1 },
        (_, i) => i + 1,
      ).join(',');
      const result = moviesQuerySchema.safeParse({ genre_ids });
      expect(result.success).toBe(false);
    });
  });

  describe('release_date_gte', () => {
    it('デフォルトでundefinedであること', () => {
      const result = moviesQuerySchema.parse({});
      expect(result.release_date_gte).toBeUndefined();
    });

    it('有効な日付形式を受け入れること', () => {
      const result = moviesQuerySchema.parse({
        release_date_gte: '2025-01-15',
      });
      expect(result.release_date_gte).toBe('2025-01-15');
    });

    it('無効な日付形式を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2025/01/15',
      });
      expect(result.success).toBe(false);
    });

    it('不完全な日付形式を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2025-1-5',
      });
      expect(result.success).toBe(false);
    });
  });

  // 正規表現は桁数しか見ないため、存在しない日付が通過して
  // Postgres の date 比較で 500 になっていた（#995）
  describe('日付の実在性', () => {
    it.each([
      ['月が範囲外', '2026-13-45'],
      ['日が範囲外', '2026-02-30'],
      ['ゼロ日付', '0000-00-00'],
      ['うるう年でない2月29日', '2026-02-29'],
      ['31日の無い月', '2026-04-31'],
      ['0月', '2026-00-10'],
      ['0日', '2026-10-00'],
    ])('%s（%s）を開始日で拒否する', (_label, value) => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: value,
      });

      expect(result.success).toBe(false);
    });

    it.each([
      ['月が範囲外', '2026-13-45'],
      ['うるう年でない2月29日', '2026-02-29'],
    ])('%s（%s）を終了日でも拒否する', (_label, value) => {
      const result = moviesQuerySchema.safeParse({
        release_date_lte: value,
      });

      expect(result.success).toBe(false);
    });

    it('うるう年の2月29日は受け入れる', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2024-02-29',
      });

      expect(result.success).toBe(true);
    });

    it('月末の日付を受け入れる', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2026-01-31',
        release_date_lte: '2026-12-31',
      });

      expect(result.success).toBe(true);
    });
  });

  // 開始日が終了日より後だと、どう絞り込んでも空集合になる。
  // 200 / 0件で返していたため「該当なし」と区別が付かなかった（#995）
  describe('開始日と終了日の相関', () => {
    it('開始日が終了日より後なら拒否する', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2027-01-01',
        release_date_lte: '2026-01-01',
      });

      expect(result.success).toBe(false);
    });

    it('エラーは終了日のフィールドに付く', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2027-01-01',
        release_date_lte: '2026-01-01',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.flatten().fieldErrors.release_date_lte).toEqual([
        '終了日は開始日以降の日付を指定してください',
      ]);
    });

    it('開始日と終了日が同じなら受け入れる（その日1日の絞り込み）', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2026-05-01',
        release_date_lte: '2026-05-01',
      });

      expect(result.success).toBe(true);
    });

    it('開始日が終了日より前なら受け入れる', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_gte: '2026-01-01',
        release_date_lte: '2026-12-31',
      });

      expect(result.success).toBe(true);
    });

    it.each([
      ['開始日のみ', { release_date_gte: '2027-01-01' }],
      ['終了日のみ', { release_date_lte: '2020-01-01' }],
      ['どちらも未指定', {}],
    ])('%s なら相関チェックは走らない', (_label, input) => {
      const result = moviesQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe('release_date_lte', () => {
    it('デフォルトでundefinedであること', () => {
      const result = moviesQuerySchema.parse({});
      expect(result.release_date_lte).toBeUndefined();
    });

    it('有効な日付形式を受け入れること', () => {
      const result = moviesQuerySchema.parse({
        release_date_lte: '2025-12-31',
      });
      expect(result.release_date_lte).toBe('2025-12-31');
    });

    it('無効な日付形式を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({
        release_date_lte: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('is_revival', () => {
    it('デフォルトでundefinedであること', () => {
      const result = moviesQuerySchema.parse({});
      expect(result.is_revival).toBeUndefined();
    });

    it('"true"をtrueに変換すること', () => {
      const result = moviesQuerySchema.parse({ is_revival: 'true' });
      expect(result.is_revival).toBe(true);
    });

    it('"false"をfalseに変換すること', () => {
      const result = moviesQuerySchema.parse({ is_revival: 'false' });
      expect(result.is_revival).toBe(false);
    });

    it('無効な値を拒否すること', () => {
      const result = moviesQuerySchema.safeParse({ is_revival: 'yes' });
      expect(result.success).toBe(false);
    });
  });

  describe('複合テスト', () => {
    it('pageとsort_byの両方を受け入れること', () => {
      const result = moviesQuerySchema.parse({
        page: '3',
        sort_by: 'popularity',
      });
      expect(result.page).toBe(3);
      expect(result.sort_by).toBe('popularity');
    });

    it('全パラメータを受け入れること', () => {
      const result = moviesQuerySchema.parse({
        page: '2',
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: '28,12',
        release_date_gte: '2025-01-01',
        release_date_lte: '2025-06-30',
        is_revival: 'true',
      });
      expect(result.page).toBe(2);
      expect(result.sort_by).toBe('popularity');
      expect(result.release_type).toBe('streaming');
      expect(result.genre_ids).toEqual([28, 12]);
      expect(result.release_date_gte).toBe('2025-01-01');
      expect(result.release_date_lte).toBe('2025-06-30');
      expect(result.is_revival).toBe(true);
    });
  });

  describe('include_regions', () => {
    it('未指定なら undefined になる', () => {
      const result = moviesQuerySchema.parse({});

      expect(result.include_regions).toBeUndefined();
    });

    it('カンマ区切りを配列に変換する', () => {
      const result = moviesQuerySchema.parse({
        include_regions: 'korea,thai_indian',
      });

      expect(result.include_regions).toEqual(['korea', 'thai_indian']);
    });

    it('未知の地域キーは拒否する', () => {
      const result = moviesQuerySchema.safeParse({
        include_regions: 'korea,atlantis',
      });

      expect(result.success).toBe(false);
    });

    it('空文字は拒否する', () => {
      const result = moviesQuerySchema.safeParse({ include_regions: '' });

      expect(result.success).toBe(false);
    });
  });
});
