/**
 * 映画関連バリデーションスキーマのテスト
 */

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

  describe('複合テスト', () => {
    it('pageとsort_byの両方を受け入れること', () => {
      const result = moviesQuerySchema.parse({
        page: '3',
        sort_by: 'popularity',
      });
      expect(result.page).toBe(3);
      expect(result.sort_by).toBe('popularity');
    });
  });
});
