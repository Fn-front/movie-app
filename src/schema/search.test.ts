/**
 * 検索関連バリデーションスキーマのテスト
 */

import { SEARCH_VALIDATION } from '@/constants';

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
    it('単一のジャンルIDを数値配列に変換すること', () => {
      const result = searchQuerySchema.parse({ genre: '28' });
      expect(result.genre).toEqual([28]);
    });

    it('カンマ区切りの複数ジャンルIDを数値配列に変換すること', () => {
      const result = searchQuerySchema.parse({ genre: '28,12,35' });
      expect(result.genre).toEqual([28, 12, 35]);
    });

    it('不正な形式のジャンルIDを拒否すること', () => {
      const result = searchQuerySchema.safeParse({ genre: 'abc' });
      expect(result.success).toBe(false);
    });

    it('末尾にカンマがある場合を拒否すること', () => {
      const result = searchQuerySchema.safeParse({ genre: '28,' });
      expect(result.success).toBe(false);
    });

    it(`上限（${SEARCH_VALIDATION.MAX_GENRE_IDS}件）ちょうどを受け入れること`, () => {
      const genre = Array.from(
        { length: SEARCH_VALIDATION.MAX_GENRE_IDS },
        (_, i) => i + 1,
      ).join(',');
      const result = searchQuerySchema.parse({ genre });
      expect(result.genre).toHaveLength(SEARCH_VALIDATION.MAX_GENRE_IDS);
    });

    it(`上限（${SEARCH_VALIDATION.MAX_GENRE_IDS}件）を超える指定を拒否すること`, () => {
      const genre = Array.from(
        { length: SEARCH_VALIDATION.MAX_GENRE_IDS + 1 },
        (_, i) => i + 1,
      ).join(',');
      const result = searchQuerySchema.safeParse({ genre });
      expect(result.success).toBe(false);
    });

    it('上限超過エラーがfieldErrors側に入ること（検索条件なし判定を壊さない）', () => {
      const genre = Array.from(
        { length: SEARCH_VALIDATION.MAX_GENRE_IDS + 1 },
        (_, i) => i + 1,
      ).join(',');
      const result = searchQuerySchema.safeParse({ genre });

      expect(result.success).toBe(false);
      const flattened = result.error!.flatten();
      expect(flattened.formErrors).toHaveLength(0);
      expect(flattened.fieldErrors.genre).toBeDefined();
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
      expect(result.genre).toEqual([28]);
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
      expect(result.genre).toEqual([28, 12]);
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
      expect(result.genre).toEqual([28]);
      expect(result.year).toBe(2024);
    });
  });

  // 年（primary_release_year）と期間（release_date.gte/lte）は
  // 意味論が違うため、置き換えではなく別パラメータとして足した（#997）
  describe('公開期間（release_date_gte / release_date_lte）', () => {
    it('期間だけでも検索条件として成立する', () => {
      const result = searchQuerySchema.safeParse({
        release_date_gte: '2026-04-01',
        release_date_lte: '2026-06-30',
      });

      expect(result.success).toBe(true);
    });

    it('開始日のみでも成立する', () => {
      expect(
        searchQuerySchema.safeParse({ release_date_gte: '2026-04-01' }).success,
      ).toBe(true);
    });

    it('終了日のみでも成立する', () => {
      expect(
        searchQuerySchema.safeParse({ release_date_lte: '2026-06-30' }).success,
      ).toBe(true);
    });

    it.each([
      ['月が範囲外', '2026-13-45'],
      ['日が範囲外', '2026-02-30'],
      ['うるう年でない2月29日', '2026-02-29'],
      ['形式違い', '2026/04/01'],
    ])('%s（%s）を拒否する', (_label, value) => {
      expect(
        searchQuerySchema.safeParse({ release_date_gte: value }).success,
      ).toBe(false);
    });

    it('開始日が終了日より後なら拒否する', () => {
      const result = searchQuerySchema.safeParse({
        release_date_gte: '2026-07-01',
        release_date_lte: '2026-06-30',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.flatten().fieldErrors.release_date_lte).toEqual([
        '終了日は開始日以降の日付を指定してください',
      ]);
    });

    it('開始日と終了日が同じなら受け入れる', () => {
      expect(
        searchQuerySchema.safeParse({
          release_date_gte: '2026-06-01',
          release_date_lte: '2026-06-01',
        }).success,
      ).toBe(true);
    });
  });

  // 同じ「2026年」でも year と期間で結果が食い違うため混ぜない
  describe('公開年と公開期間の排他', () => {
    it.each([
      ['開始日と同時', { year: '2026', release_date_gte: '2026-04-01' }],
      ['終了日と同時', { year: '2026', release_date_lte: '2026-06-30' }],
      [
        '両方と同時',
        {
          year: '2026',
          release_date_gte: '2026-04-01',
          release_date_lte: '2026-06-30',
        },
      ],
    ])('年を%sに指定すると拒否する', (_label, input) => {
      const result = searchQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.flatten().fieldErrors.year).toEqual([
        '公開年と公開期間は同時に指定できません',
      ]);
    });

    it('年だけなら従来どおり受け入れる', () => {
      const result = searchQuerySchema.safeParse({ year: '2026' });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.year).toBe(2026);
    });
  });
});
