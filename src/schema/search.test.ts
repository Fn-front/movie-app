/**
 * 検索関連バリデーションスキーマのテスト
 */

import { searchQuerySchema } from './search';

describe('searchQuerySchema', () => {
  describe('query', () => {
    it('有効なキーワードを受け入れること', () => {
      const result = searchQuerySchema.parse({ query: 'アクション' });
      expect(result.query).toBe('アクション');
    });

    it('空文字のqueryを拒否すること', () => {
      const result = searchQuerySchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });

    it('空白のみのqueryを拒否すること', () => {
      const result = searchQuerySchema.safeParse({ query: '   ' });
      expect(result.success).toBe(false);
    });
  });

  describe('page', () => {
    it('デフォルト値が1であること', () => {
      const result = searchQuerySchema.parse({ query: 'test' });
      expect(result.page).toBe(1);
    });

    it('有効なページ番号を受け入れること', () => {
      const result = searchQuerySchema.parse({ query: 'test', page: '5' });
      expect(result.page).toBe(5);
    });

    it('0以下のページ番号を拒否すること', () => {
      const result = searchQuerySchema.safeParse({
        query: 'test',
        page: '0',
      });
      expect(result.success).toBe(false);
    });

    it('500を超えるページ番号を拒否すること', () => {
      const result = searchQuerySchema.safeParse({
        query: 'test',
        page: '501',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('genre', () => {
    it('単一のジャンルIDを受け入れること', () => {
      const result = searchQuerySchema.parse({ genre: '28' });
      expect(result.genre).toBe('28');
    });

    it('カンマ区切りの複数ジャンルIDを受け入れること', () => {
      const result = searchQuerySchema.parse({ genre: '28,12,35' });
      expect(result.genre).toBe('28,12,35');
    });

    it('不正な形式のジャンルIDを拒否すること', () => {
      const result = searchQuerySchema.safeParse({ genre: 'abc' });
      expect(result.success).toBe(false);
    });

    it('末尾にカンマがある場合を拒否すること', () => {
      const result = searchQuerySchema.safeParse({ genre: '28,' });
      expect(result.success).toBe(false);
    });
  });

  describe('year', () => {
    it('有効な公開年を受け入れること', () => {
      const result = searchQuerySchema.parse({ year: '2024' });
      expect(result.year).toBe(2024);
    });

    it('1900未満の年を拒否すること', () => {
      const result = searchQuerySchema.safeParse({ year: '1899' });
      expect(result.success).toBe(false);
    });

    it('現在+5年を超える年を拒否すること', () => {
      const futureYear = new Date().getFullYear() + 6;
      const result = searchQuerySchema.safeParse({
        year: String(futureYear),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('vote_average_gte', () => {
    it('有効な評価値を受け入れること', () => {
      const result = searchQuerySchema.parse({ vote_average_gte: '7.0' });
      expect(result.vote_average_gte).toBe(7.0);
    });

    it('0を受け入れること', () => {
      const result = searchQuerySchema.parse({ vote_average_gte: '0' });
      expect(result.vote_average_gte).toBe(0);
    });

    it('10を受け入れること', () => {
      const result = searchQuerySchema.parse({ vote_average_gte: '10' });
      expect(result.vote_average_gte).toBe(10);
    });

    it('10を超える値を拒否すること', () => {
      const result = searchQuerySchema.safeParse({
        vote_average_gte: '11',
      });
      expect(result.success).toBe(false);
    });

    it('負の値を拒否すること', () => {
      const result = searchQuerySchema.safeParse({
        vote_average_gte: '-1',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('検索条件のrefineバリデーション', () => {
    it('queryもフィルターもない場合を拒否すること', () => {
      const result = searchQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('queryのみで検索できること', () => {
      const result = searchQuerySchema.parse({ query: 'アクション' });
      expect(result.query).toBe('アクション');
    });

    it('genreのみで検索できること', () => {
      const result = searchQuerySchema.parse({ genre: '28' });
      expect(result.genre).toBe('28');
    });

    it('yearのみで検索できること', () => {
      const result = searchQuerySchema.parse({ year: '2024' });
      expect(result.year).toBe(2024);
    });

    it('vote_average_gteのみで検索できること', () => {
      const result = searchQuerySchema.parse({ vote_average_gte: '7' });
      expect(result.vote_average_gte).toBe(7);
    });
  });

  describe('複合テスト', () => {
    it('全パラメータを受け入れること', () => {
      const result = searchQuerySchema.parse({
        query: 'アクション',
        page: '2',
        genre: '28,12',
        year: '2024',
        vote_average_gte: '7.5',
      });
      expect(result.query).toBe('アクション');
      expect(result.page).toBe(2);
      expect(result.genre).toBe('28,12');
      expect(result.year).toBe(2024);
      expect(result.vote_average_gte).toBe(7.5);
    });

    it('queryとフィルターの組み合わせを受け入れること', () => {
      const result = searchQuerySchema.parse({
        query: 'マーベル',
        genre: '28',
        year: '2024',
      });
      expect(result.query).toBe('マーベル');
      expect(result.genre).toBe('28');
      expect(result.year).toBe(2024);
    });
  });
});
