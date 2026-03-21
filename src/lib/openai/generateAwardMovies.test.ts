/**
 * @jest-environment node
 */

/**
 * 受賞作品取得ロジック テスト
 */

import type { AwardDefinition } from '@/constants/awards';
import type { OpenAiAwardItem } from '@/schema/awards';

// --- Mocks ---

const mockCreate = jest.fn();
jest.mock('./client', () => ({
  createOpenAIClient: jest.fn(() => ({
    responses: { create: mockCreate },
  })),
  getOpenAIModel: jest.fn(() => 'gpt-4o-mini'),
}));

const mockSearchMovies = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: (...args: unknown[]) => mockSearchMovies(...args),
}));

import {
  buildUserPrompt,
  fetchAwardsFromOpenAI,
  resolveAwardsWithTMDb,
} from './generateAwardMovies';

// --- Helper ---

const testAwardDefinition: AwardDefinition = {
  label: 'テスト賞',
  month: 3,
  categories: [
    { key: 'best_picture', label: '作品賞' },
    { key: 'best_director', label: '監督賞' },
  ],
};

function createAwardItem(
  overrides: Partial<OpenAiAwardItem> = {},
): OpenAiAwardItem {
  return {
    title_ja: 'テスト映画',
    title_en: 'Test Movie',
    category: 'best_picture',
    is_winner: true,
    year: 2026,
    ...overrides,
  };
}

function createMockResponseOutput(content: string) {
  return {
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: content }],
      },
    ],
  };
}

// --- Tests ---

describe('buildUserPrompt', () => {
  it('年・賞名・部門を含むプロンプトを生成する', () => {
    const prompt = buildUserPrompt(
      2026,
      'アカデミー賞',
      testAwardDefinition.categories,
    );

    expect(prompt).toContain('2026年 アカデミー賞');
    expect(prompt).toContain('- best_picture: 作品賞');
    expect(prompt).toContain('- best_director: 監督賞');
  });

  it('部門キーをそのまま使用するよう指示する', () => {
    const prompt = buildUserPrompt(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(prompt).toContain('categoryフィールドには上記の部門キーをそのまま使用');
  });
});

describe('fetchAwardsFromOpenAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常なレスポンスをパースして返す', async () => {
    const mockResponse = {
      awards: [createAwardItem()],
    };

    mockCreate.mockResolvedValue(
      createMockResponseOutput(JSON.stringify(mockResponse)),
    );

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(result).toHaveLength(1);
    expect(result![0].title_ja).toBe('テスト映画');
    expect(result![0].is_winner).toBe(true);
  });

  it('OpenAIクライアントがnullの場合、nullを返す', async () => {
    const { createOpenAIClient } = await import('./client');
    (createOpenAIClient as jest.Mock).mockReturnValueOnce(null);

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(result).toBeNull();
  });

  it('メッセージ出力がない場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({ output: [] });

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(result).toBeNull();
  });

  it('テキストコンテンツがない場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({
      output: [
        {
          type: 'message',
          content: [],
        },
      ],
    });

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(result).toBeNull();
  });

  it('不正なJSONレスポンスの場合、nullを返す', async () => {
    mockCreate.mockResolvedValue(
      createMockResponseOutput('not json'),
    );

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(result).toBeNull();
  });

  it('zodバリデーション失敗の場合、nullを返す', async () => {
    mockCreate.mockResolvedValue(
      createMockResponseOutput(
        JSON.stringify({ awards: [{ invalid: true }] }),
      ),
    );

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(result).toBeNull();
  });

  it('API呼び出し失敗の場合、nullを返す', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    expect(result).toBeNull();
  });

  it('Responses APIのパラメータが正しく設定される', async () => {
    const mockResponse = {
      awards: [createAwardItem()],
    };
    mockCreate.mockResolvedValue(
      createMockResponseOutput(JSON.stringify(mockResponse)),
    );

    await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testAwardDefinition.categories,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toEqual([{ type: 'web_search_preview' }]);
    expect(callArgs.text.format.type).toBe('json_schema');
    expect(callArgs.text.format.strict).toBe(true);
  });
});

describe('resolveAwardsWithTMDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TMDb検索結果から映画情報を解決する', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 100,
          title: 'テスト映画',
          poster_path: '/poster.jpg',
          release_date: '2026-01-01',
          vote_average: 8.5,
          genre_ids: [18],
        },
      ],
    });

    const items = [createAwardItem()];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(100);
    expect(result[0].category).toBe('best_picture');
    expect(result[0].is_winner).toBe(true);
    expect(result[0].display_order).toBe(1);
  });

  it('日本語タイトルで見つからない場合、英語タイトルで検索する', async () => {
    mockSearchMovies
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({
        results: [
          {
            id: 200,
            title: 'Test Movie',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });

    const items = [createAwardItem()];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(200);
    expect(mockSearchMovies).toHaveBeenCalledTimes(2);
    expect(mockSearchMovies).toHaveBeenCalledWith({ query: 'テスト映画' });
    expect(mockSearchMovies).toHaveBeenCalledWith({ query: 'Test Movie' });
  });

  it('両方の検索で見つからない場合はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({ results: [] });

    const items = [createAwardItem()];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(0);
  });

  it('不明な部門キーはスキップする', async () => {
    const items = [createAwardItem({ category: 'unknown_category' })];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(0);
    expect(mockSearchMovies).not.toHaveBeenCalled();
  });

  it('同じ映画×同じ部門の重複はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 300,
          title: 'テスト映画',
          poster_path: null,
          release_date: '2026-01-01',
          vote_average: 7.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [
      createAwardItem({ is_winner: true }),
      createAwardItem({ is_winner: false }),
    ];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
  });

  it('同じ映画でも部門が異なれば別々に追加する', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 400,
          title: 'テスト映画',
          poster_path: null,
          release_date: '2026-01-01',
          vote_average: 8.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [
      createAwardItem({ category: 'best_picture' }),
      createAwardItem({ category: 'best_director' }),
    ];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe('best_picture');
    expect(result[1].category).toBe('best_director');
  });

  it('TMDb検索でエラーが発生した場合はスキップして次に進む', async () => {
    mockSearchMovies
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        results: [
          {
            id: 500,
            title: '成功映画',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.5,
            genre_ids: [18],
          },
        ],
      });

    const items = [
      createAwardItem({ title_ja: 'エラー映画', title_en: 'Error Movie' }),
      createAwardItem({
        title_ja: '成功映画',
        title_en: 'Success Movie',
        category: 'best_director',
      }),
    ];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('成功映画');
  });
});
