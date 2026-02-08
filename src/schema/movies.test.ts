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

    it('カンマ区切りの文字列を受け入れること', () => {
      const result = moviesQuerySchema.parse({ genre_ids: '28,12,878' });
      expect(result.genre_ids).toBe('28,12,878');
    });

    it('単一のジャンルIDを受け入れること', () => {
      const result = moviesQuerySchema.parse({ genre_ids: '28' });
      expect(result.genre_ids).toBe('28');
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
      });
      expect(result.page).toBe(2);
      expect(result.sort_by).toBe('popularity');
      expect(result.release_type).toBe('streaming');
      expect(result.genre_ids).toBe('28,12');
    });
  });
});
