/**
 * 原題提案スキーマのテスト
 */

import {
  titleSuggestionQuerySchema,
  openAiTitleSuggestionResponseSchema,
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
});

describe('openAiTitleSuggestionResponseSchema', () => {
  it('原題ありのレスポンスを受け付ける', () => {
    const result = openAiTitleSuggestionResponseSchema.safeParse({
      suggested_title: 'The Shawshank Redemption',
    });
    expect(result.success).toBe(true);
    expect(result.data?.suggested_title).toBe('The Shawshank Redemption');
  });

  it('nullのレスポンスを受け付ける', () => {
    const result = openAiTitleSuggestionResponseSchema.safeParse({
      suggested_title: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.suggested_title).toBeNull();
  });

  it('空文字列を拒否する', () => {
    const result = openAiTitleSuggestionResponseSchema.safeParse({
      suggested_title: '',
    });
    expect(result.success).toBe(false);
  });

  it('suggested_titleが未指定の場合を拒否する', () => {
    const result = openAiTitleSuggestionResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
