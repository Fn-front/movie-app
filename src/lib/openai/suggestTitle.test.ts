/**
 * @jest-environment node
 */

/**
 * 原題提案ロジック テスト
 */

import { TITLE_SUGGESTION } from '@/constants';

// --- Mocks ---

const mockCreate = jest.fn();
jest.mock('./client', () => ({
  createOpenAIClient: jest.fn(() => ({
    responses: { create: mockCreate },
  })),
  getOpenAIModel: jest.fn(() => 'gpt-4o-mini'),
}));

import { fetchTitleSuggestionsFromOpenAI } from './suggestTitle';

// --- Tests ---

describe('fetchTitleSuggestionsFromOpenAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常なレスポンスをパースして返す', async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({
        suggestions: ['The Shawshank Redemption'],
      }),
    });

    const result = await fetchTitleSuggestionsFromOpenAI('ショーシャンク');

    expect(result).toEqual(['The Shawshank Redemption']);
  });

  it('上限を超える候補が返っても、[]にせず先頭MAX件に切り詰めて返す', async () => {
    // LLMは上限件数を厳密に守らず超過して返すことがある。
    // 以前は上限超過でzod検証に失敗し[]を返し、候補ゼロになっていた。
    const over = Array.from(
      { length: TITLE_SUGGESTION.MAX_SUGGESTIONS + 3 },
      (_, i) => `Movie ${i + 1}`,
    );
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({ suggestions: over }),
    });

    const result = await fetchTitleSuggestionsFromOpenAI('テスト');

    expect(result).toHaveLength(TITLE_SUGGESTION.MAX_SUGGESTIONS);
    expect(result[0]).toBe('Movie 1');
  });

  it('空配列レスポンスはそのまま空配列を返す', async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({ suggestions: [] }),
    });

    const result = await fetchTitleSuggestionsFromOpenAI('Inception');

    expect(result).toEqual([]);
  });

  it('プロンプトに上限件数が反映される', async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({ suggestions: [] }),
    });

    await fetchTitleSuggestionsFromOpenAI('テスト');

    const instructions = mockCreate.mock.calls[0][0].instructions;
    expect(instructions).toContain(`上限${TITLE_SUGGESTION.MAX_SUGGESTIONS}件`);
  });

  it('OpenAIクライアントがnullの場合、[]を返す', async () => {
    const { createOpenAIClient } = await import('./client');
    (createOpenAIClient as jest.Mock).mockReturnValueOnce(null);

    const result = await fetchTitleSuggestionsFromOpenAI('テスト');

    expect(result).toEqual([]);
  });

  it('output_textが空の場合、[]を返す', async () => {
    mockCreate.mockResolvedValue({ output_text: '' });

    const result = await fetchTitleSuggestionsFromOpenAI('テスト');

    expect(result).toEqual([]);
  });

  it('不正なJSONレスポンスの場合、[]を返す', async () => {
    mockCreate.mockResolvedValue({ output_text: 'not json' });

    const result = await fetchTitleSuggestionsFromOpenAI('テスト');

    expect(result).toEqual([]);
  });

  it('空文字を含む不正な候補の場合、[]を返す', async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({ suggestions: [''] }),
    });

    const result = await fetchTitleSuggestionsFromOpenAI('テスト');

    expect(result).toEqual([]);
  });

  it('API呼び出し失敗の場合、[]を返す', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const result = await fetchTitleSuggestionsFromOpenAI('テスト');

    expect(result).toEqual([]);
  });
});
