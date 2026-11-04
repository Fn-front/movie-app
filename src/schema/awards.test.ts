/**
 * 受賞作品スキーマ テスト
 */

import { openAiAwardItemSchema, openAiAwardsResponseSchema } from './awards';

describe('openAiAwardItemSchema', () => {
  const validItem = {
    title_ja: 'テスト映画',
    title_en: 'Test Movie',
    category: 'best_picture',
    is_winner: true,
    year: 2026,
  };

  it('有効なデータをパースできる', () => {
    const result = openAiAwardItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('person_name が null でも有効（作品賞）', () => {
    // OpenAI の Structured Outputs は strict モードで全キーを required にするため、
    // 作品賞では null が返る。ここで弾くとレスポンス全体が不正扱いになり取得0件になる
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      person_name: null,
    });
    expect(result.success).toBe(true);
  });

  it('person_name が無くても有効（eiga.com / wikitext 経路）', () => {
    // これらのパーサは人名が取れないとき項目自体を省く
    const result = openAiAwardItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('person_name に文字列を入れられる（演技賞）', () => {
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      person_name: 'ショーン・ペン',
    });
    expect(result.success).toBe(true);
  });

  it('person_name が数値の場合エラーになる', () => {
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      person_name: 123,
    });
    expect(result.success).toBe(false);
  });

  it('title_jaが空の場合エラーになる', () => {
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      title_ja: '',
    });
    expect(result.success).toBe(false);
  });

  it('title_enが空の場合エラーになる', () => {
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      title_en: '',
    });
    expect(result.success).toBe(false);
  });

  it('categoryが空の場合エラーになる', () => {
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      category: '',
    });
    expect(result.success).toBe(false);
  });

  it('yearが範囲外の場合エラーになる', () => {
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      year: 1800,
    });
    expect(result.success).toBe(false);
  });

  it('is_winnerがbooleanでない場合エラーになる', () => {
    const result = openAiAwardItemSchema.safeParse({
      ...validItem,
      is_winner: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

describe('openAiAwardsResponseSchema', () => {
  it('有効なレスポンスをパースできる', () => {
    const result = openAiAwardsResponseSchema.safeParse({
      awards: [
        {
          title_ja: 'テスト映画',
          title_en: 'Test Movie',
          category: 'best_picture',
          is_winner: true,
          year: 2026,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('awards配列が空でも有効（未発表の賞に対応）', () => {
    const result = openAiAwardsResponseSchema.safeParse({
      awards: [],
    });
    expect(result.success).toBe(true);
  });
});
