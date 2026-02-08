/**
 * フィルター条件バリデーションスキーマのテスト
 */

import { filterConditionsSchema } from './filters';

describe('filterConditionsSchema', () => {
  describe('空オブジェクト', () => {
    it('空オブジェクトを受け入れること', () => {
      const result = filterConditionsSchema.parse({});
      expect(result).toEqual({});
    });
  });

  describe('sort_by', () => {
    it('undefinedを受け入れること', () => {
      const result = filterConditionsSchema.parse({});
      expect(result.sort_by).toBeUndefined();
    });

    it('release_dateを受け入れること', () => {
      const result = filterConditionsSchema.parse({ sort_by: 'release_date' });
      expect(result.sort_by).toBe('release_date');
    });

    it('popularityを受け入れること', () => {
      const result = filterConditionsSchema.parse({ sort_by: 'popularity' });
      expect(result.sort_by).toBe('popularity');
    });

    it('vote_averageを受け入れること', () => {
      const result = filterConditionsSchema.parse({
        sort_by: 'vote_average',
      });
      expect(result.sort_by).toBe('vote_average');
    });

    it('無効なソート値を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({
        sort_by: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('release_type', () => {
    it('undefinedを受け入れること', () => {
      const result = filterConditionsSchema.parse({});
      expect(result.release_type).toBeUndefined();
    });

    it('theatricalを受け入れること', () => {
      const result = filterConditionsSchema.parse({
        release_type: 'theatrical',
      });
      expect(result.release_type).toBe('theatrical');
    });

    it('streamingを受け入れること', () => {
      const result = filterConditionsSchema.parse({
        release_type: 'streaming',
      });
      expect(result.release_type).toBe('streaming');
    });

    it('無効なリリースタイプを拒否すること', () => {
      const result = filterConditionsSchema.safeParse({
        release_type: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('genre_ids', () => {
    it('undefinedを受け入れること', () => {
      const result = filterConditionsSchema.parse({});
      expect(result.genre_ids).toBeUndefined();
    });

    it('数値配列を受け入れること', () => {
      const result = filterConditionsSchema.parse({ genre_ids: [28, 12, 878] });
      expect(result.genre_ids).toEqual([28, 12, 878]);
    });

    it('空配列を受け入れること', () => {
      const result = filterConditionsSchema.parse({ genre_ids: [] });
      expect(result.genre_ids).toEqual([]);
    });

    it('単一要素の配列を受け入れること', () => {
      const result = filterConditionsSchema.parse({ genre_ids: [28] });
      expect(result.genre_ids).toEqual([28]);
    });

    it('0以下の数値を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({ genre_ids: [0] });
      expect(result.success).toBe(false);
    });

    it('負の数値を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({ genre_ids: [-1] });
      expect(result.success).toBe(false);
    });

    it('小数を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({ genre_ids: [1.5] });
      expect(result.success).toBe(false);
    });

    it('文字列を含む配列を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({
        genre_ids: ['28'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('date_range_gte', () => {
    it('undefinedを受け入れること', () => {
      const result = filterConditionsSchema.parse({});
      expect(result.date_range_gte).toBeUndefined();
    });

    it('有効な日付形式を受け入れること', () => {
      const result = filterConditionsSchema.parse({
        date_range_gte: '2025-01-15',
      });
      expect(result.date_range_gte).toBe('2025-01-15');
    });

    it('無効な日付形式を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({
        date_range_gte: '2025/01/15',
      });
      expect(result.success).toBe(false);
    });

    it('不完全な日付形式を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({
        date_range_gte: '2025-1-5',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('date_range_lte', () => {
    it('undefinedを受け入れること', () => {
      const result = filterConditionsSchema.parse({});
      expect(result.date_range_lte).toBeUndefined();
    });

    it('有効な日付形式を受け入れること', () => {
      const result = filterConditionsSchema.parse({
        date_range_lte: '2025-12-31',
      });
      expect(result.date_range_lte).toBe('2025-12-31');
    });

    it('無効な日付形式を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({
        date_range_lte: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('is_revival', () => {
    it('undefinedを受け入れること', () => {
      const result = filterConditionsSchema.parse({});
      expect(result.is_revival).toBeUndefined();
    });

    it('trueを受け入れること', () => {
      const result = filterConditionsSchema.parse({ is_revival: true });
      expect(result.is_revival).toBe(true);
    });

    it('falseを受け入れること', () => {
      const result = filterConditionsSchema.parse({ is_revival: false });
      expect(result.is_revival).toBe(false);
    });

    it('文字列を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({
        is_revival: 'true',
      });
      expect(result.success).toBe(false);
    });

    it('数値を拒否すること', () => {
      const result = filterConditionsSchema.safeParse({ is_revival: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('複合テスト', () => {
    it('全フィールドを指定した場合に受け入れること', () => {
      const result = filterConditionsSchema.parse({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [28, 12],
        date_range_gte: '2025-01-01',
        date_range_lte: '2025-12-31',
        is_revival: true,
      });
      expect(result.sort_by).toBe('popularity');
      expect(result.release_type).toBe('streaming');
      expect(result.genre_ids).toEqual([28, 12]);
      expect(result.date_range_gte).toBe('2025-01-01');
      expect(result.date_range_lte).toBe('2025-12-31');
      expect(result.is_revival).toBe(true);
    });

    it('一部のフィールドのみ指定した場合に受け入れること', () => {
      const result = filterConditionsSchema.parse({
        sort_by: 'release_date',
        genre_ids: [28],
      });
      expect(result.sort_by).toBe('release_date');
      expect(result.genre_ids).toEqual([28]);
      expect(result.release_type).toBeUndefined();
      expect(result.date_range_gte).toBeUndefined();
      expect(result.date_range_lte).toBeUndefined();
      expect(result.is_revival).toBeUndefined();
    });

    it('未定義のフィールドを含む場合は除去されること', () => {
      const input = {
        sort_by: 'popularity',
        unknown_field: 'should be stripped',
      };
      const result = filterConditionsSchema.parse(input);
      expect(result).toEqual({ sort_by: 'popularity' });
      expect('unknown_field' in result).toBe(false);
    });
  });
});
