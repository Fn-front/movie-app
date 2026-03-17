/**
 * 原題提案スキーマのテスト
 */

import {
  titleSuggestionQuerySchema,
  openAiTitleSuggestionsResponseSchema,
} from './titleSuggestion';

describe('titleSuggestionQuerySchema', () => {
  it('有効なクエリを受け付ける', () => {
    const result = titleSuggestionQuerySchema.safeParse({
      query: 'ショーシャンクの空に',
    });
    expect(result.success).toBe(true);
  });

  it('空文字列を拒否する', () => {
    const result = titleSuggestionQuerySchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('空白のみの文字列を拒否する', () => {
    const result = titleSuggestionQuerySchema.safeParse({ query: '   ' });
    expect(result.success).toBe(false);
  });

  it('queryが未指定の場合を拒否する', () => {
    const result = titleSuggestionQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('256文字以上のクエリを拒否する', () => {
    const result = titleSuggestionQuerySchema.safeParse({
      query: 'a'.repeat(256),
    });
    expect(result.success).toBe(false);
  });
});

describe('openAiTitleSuggestionsResponseSchema', () => {
  it('候補ありのレスポンスを受け付ける', () => {
    const result = openAiTitleSuggestionsResponseSchema.safeParse({
      suggestions: ['The Shawshank Redemption', 'Shawshank'],
    });
    expect(result.success).toBe(true);
    expect(result.data?.suggestions).toEqual([
      'The Shawshank Redemption',
      'Shawshank',
    ]);
  });

  it('空配列を受け付ける', () => {
    const result = openAiTitleSuggestionsResponseSchema.safeParse({
      suggestions: [],
    });
    expect(result.success).toBe(true);
    expect(result.data?.suggestions).toEqual([]);
  });

  it('5件を超える候補を拒否する', () => {
    const result = openAiTitleSuggestionsResponseSchema.safeParse({
      suggestions: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(result.success).toBe(false);
  });

  it('空文字列を含む候補を拒否する', () => {
    const result = openAiTitleSuggestionsResponseSchema.safeParse({
      suggestions: ['The Shawshank Redemption', ''],
    });
    expect(result.success).toBe(false);
  });

  it('suggestionsが未指定の場合を拒否する', () => {
    const result = openAiTitleSuggestionsResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
