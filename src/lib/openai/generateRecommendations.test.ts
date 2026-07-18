/**
 * @jest-environment node
 */

/**
 * レコメンド生成ロジック テスト
 */

import {
  RECOMMENDATIONS_GENERATION_BUFFER,
  RECOMMENDATIONS_MAX_COUNT,
} from '@/constants';
import type { OpenAiRecommendationItem } from '@/schema/recommendations';

// --- Mocks ---

const mockCreate = jest.fn();
jest.mock('./client', () => ({
  createOpenAIClient: jest.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
  getOpenAIModel: jest.fn(() => 'gpt-4o-mini'),
}));

const mockSearchMovies = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: (...args: unknown[]) => mockSearchMovies(...args),
}));

import {
  buildUserPrompt,
  fetchRecommendationsFromOpenAI,
  resolveRecommendationsWithTMDb,
} from './generateRecommendations';

/** AIレスポンスとして保持される最大件数（最大表示件数＋取りこぼし用バッファ） */
const MAX_RESPONSE_COUNT =
  RECOMMENDATIONS_MAX_COUNT + RECOMMENDATIONS_GENERATION_BUFFER;

// --- Tests ---

describe('buildUserPrompt', () => {
  it('お気に入り映画リストからプロンプトを組み立てる', () => {
    const favorites = [
      { title: 'インターステラー', rating: 9 },
      { title: 'ブレードランナー 2049', rating: 8 },
    ];
    const excludedTitles = ['インターステラー', 'ブレードランナー 2049'];

    const prompt = buildUserPrompt(favorites, excludedTitles);

    expect(prompt).toContain('## お気に入り映画');
    expect(prompt).toContain('インターステラー - 評価: 9/10');
    expect(prompt).toContain('ブレードランナー 2049 - 評価: 8/10');
    expect(prompt).toContain('## 除外リスト');
    expect(prompt).toContain('- インターステラー');
  });

  it('評価がnullの場合、評価を表示しない', () => {
    const favorites = [{ title: 'テスト映画', rating: null }];
    const prompt = buildUserPrompt(favorites, []);

    expect(prompt).toContain('- テスト映画');
    expect(prompt).not.toContain('評価');
  });

  it('除外リストが空の場合、除外セクションを含めない', () => {
    const favorites = [{ title: 'テスト映画', rating: 5 }];
    const prompt = buildUserPrompt(favorites, []);

    expect(prompt).not.toContain('## 除外リスト');
  });

  it('興味なしリストが含まれる場合、興味なしセクションをジャンル名付きで追加する', () => {
    const favorites = [{ title: 'インターステラー', rating: 9 }];
    const dismissedMovies = [
      { tmdb_movie_id: 10, title: 'ホラー映画A', genre_ids: [27] },
      { tmdb_movie_id: 20, title: 'ホラー映画B', genre_ids: [27, 53] },
    ];
    const prompt = buildUserPrompt(favorites, [], dismissedMovies);

    expect(prompt).toContain('## 興味なしリスト');
    expect(prompt).toContain('- ホラー映画A（ホラー）');
    expect(prompt).toContain('- ホラー映画B（ホラー、スリラー）');
  });

  it('genre_idsがnullの場合、ジャンル名なしで表示する', () => {
    const favorites = [{ title: 'テスト映画', rating: 5 }];
    const dismissedMovies = [
      { tmdb_movie_id: 10, title: '不明ジャンル映画', genre_ids: null },
    ];
    const prompt = buildUserPrompt(favorites, [], dismissedMovies);

    expect(prompt).toContain('- 不明ジャンル映画');
    expect(prompt).not.toContain('- 不明ジャンル映画（');
  });

  it('興味なしリストが空の場合、興味なしセクションを含めない', () => {
    const favorites = [{ title: 'テスト映画', rating: 5 }];
    const prompt = buildUserPrompt(favorites, [], []);

    expect(prompt).not.toContain('## 興味なしリスト');
  });
});

describe('fetchRecommendationsFromOpenAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常なレスポンスをパースして返す', async () => {
    const mockResponse = {
      recommendations: [
        { title: 'Arrival', year: 2016, reason: 'SF好きにおすすめ' },
      ],
    };

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockResponse) } }],
    });

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'インターステラー', rating: 9 }],
      ['インターステラー'],
    );

    expect(result).toHaveLength(1);
    expect(result![0].title).toBe('Arrival');
    expect(result![0].reason).toBe('SF好きにおすすめ');
  });

  it('OpenAIクライアントがnullの場合、nullを返す', async () => {
    const { createOpenAIClient } = await import('./client');
    (createOpenAIClient as jest.Mock).mockReturnValueOnce(null);

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('OpenAIが空レスポンスを返した場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('不正なJSONレスポンスの場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'not json' } }],
    });

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('zodバリデーション失敗の場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ recommendations: [{ invalid: true }] }),
          },
        },
      ],
    });

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('API呼び出し失敗の場合、nullを返す', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('count引数でシステムプロンプトの推薦件数が変わる', async () => {
    const mockResponse = {
      recommendations: [{ title: 'Movie A', year: 2020, reason: '理由' }],
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockResponse) } }],
    });

    await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
      3,
    );

    const systemMessage = mockCreate.mock.calls[0][0].messages[0];
    expect(systemMessage.content).toContain('3件推薦');
  });

  it('OpenAIが上限を超える件数を返しても、nullにせず上限件数に切り詰めて返す', async () => {
    // LLMは要求件数を厳密に守らず超過して返すことがある。
    // 以前は上限超過でzod検証に失敗しnullを返し、cronが丸ごと失敗していた。
    const overCount = MAX_RESPONSE_COUNT + 1;
    const mockResponse = {
      recommendations: Array.from({ length: overCount }, (_, i) => ({
        title: `Movie ${i + 1}`,
        year: 2020,
        reason: `理由${i + 1}`,
      })),
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockResponse) } }],
    });

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(MAX_RESPONSE_COUNT);
    expect(result![0].title).toBe('Movie 1');
  });
});

describe('resolveRecommendationsWithTMDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createItem = (
    title: string,
    year: number,
    reason: string,
  ): OpenAiRecommendationItem => ({ title, year, reason });

  it('TMDb検索結果から映画情報を解決する', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 100,
          title: 'Arrival',
          poster_path: '/arrival.jpg',
          release_date: '2016-11-11',
          vote_average: 7.9,
          genre_ids: [878, 18],
        },
      ],
    });

    const items = [createItem('Arrival', 2016, 'SF好きにおすすめ')];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(100);
    expect(result[0].title).toBe('Arrival');
    expect(result[0].display_order).toBe(1);
    expect(result[0].reason).toBe('SF好きにおすすめ');
  });

  it('検索結果がない場合はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({ results: [] });

    const items = [createItem('Unknown Movie', 2020, '理由')];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(0);
  });

  it('除外リストに含まれる映画はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 200,
          title: 'Already Favorite',
          poster_path: null,
          release_date: '2020-01-01',
          vote_average: 7.0,
          genre_ids: [28],
        },
      ],
    });

    const items = [createItem('Already Favorite', 2020, '理由')];
    const result = await resolveRecommendationsWithTMDb(items, new Set([200]));

    expect(result).toHaveLength(0);
  });

  it('重複する映画はスキップする', async () => {
    mockSearchMovies
      .mockResolvedValueOnce({
        results: [
          {
            id: 300,
            title: 'Movie A',
            poster_path: null,
            release_date: '2020-01-01',
            vote_average: 7.0,
            genre_ids: [28],
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 300,
            title: 'Movie A',
            poster_path: null,
            release_date: '2020-01-01',
            vote_average: 7.0,
            genre_ids: [28],
          },
        ],
      });

    const items = [
      createItem('Movie A', 2020, '理由1'),
      createItem('Movie A Alt', 2020, '理由2'),
    ];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(1);
  });

  it('TMDb検索でエラーが発生した場合はスキップして次に進む', async () => {
    mockSearchMovies
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        results: [
          {
            id: 400,
            title: 'Movie B',
            poster_path: null,
            release_date: '2021-01-01',
            vote_average: 8.0,
            genre_ids: [12],
          },
        ],
      });

    const items = [
      createItem('Error Movie', 2020, '理由1'),
      createItem('Movie B', 2021, '理由2'),
    ];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Movie B');
    expect(result[0].display_order).toBe(1);
  });

  it('最大10件で打ち切る', async () => {
    const items: OpenAiRecommendationItem[] = [];
    for (let i = 1; i <= 12; i++) {
      items.push(createItem(`Movie ${i}`, 2020, `理由${i}`));
      mockSearchMovies.mockResolvedValueOnce({
        results: [
          {
            id: i,
            title: `Movie ${i}`,
            poster_path: null,
            release_date: '2020-01-01',
            vote_average: 7.0,
            genre_ids: [28],
          },
        ],
      });
    }

    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(10);
  });

  it('公開年が一致する候補を関連度順より優先して選択する', async () => {
    // 直前のテストで消費されなかった mockResolvedValueOnce キューを破棄
    mockSearchMovies.mockReset();
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'Dune',
          poster_path: null,
          release_date: '1984-12-14',
          vote_average: 6.3,
          genre_ids: [878],
        },
        {
          id: 2,
          title: 'Dune',
          poster_path: null,
          release_date: '2021-09-15',
          vote_average: 7.8,
          genre_ids: [878],
        },
      ],
    });

    const items = [createItem('Dune', 2021, '理由')];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(2);
  });

  it('公開年が許容範囲内の候補がない場合は先頭（関連度最上位）を選ぶ', async () => {
    mockSearchMovies.mockReset();
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 10,
          title: 'Old Movie',
          poster_path: null,
          release_date: '1990-01-01',
          vote_average: 7.0,
          genre_ids: [18],
        },
        {
          id: 20,
          title: 'Old Movie',
          poster_path: null,
          release_date: '1995-01-01',
          vote_average: 6.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [createItem('Old Movie', 2020, '理由')];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(10);
  });

  it('release_dateが空文字の候補は年一致せず先頭を選ぶ', async () => {
    mockSearchMovies.mockReset();
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 30,
          title: 'No Date Movie',
          poster_path: null,
          release_date: '',
          vote_average: 7.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [createItem('No Date Movie', 2020, '理由')];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(30);
  });

  it('limit引数で指定件数で打ち切る', async () => {
    mockSearchMovies.mockReset();
    const items: OpenAiRecommendationItem[] = [];
    for (let i = 1; i <= 5; i++) {
      items.push(createItem(`Movie ${i}`, 2020, `理由${i}`));
      mockSearchMovies.mockResolvedValueOnce({
        results: [
          {
            id: i,
            title: `Movie ${i}`,
            poster_path: null,
            release_date: '2020-01-01',
            vote_average: 7.0,
            genre_ids: [28],
          },
        ],
      });
    }

    const result = await resolveRecommendationsWithTMDb(items, new Set(), 2);

    expect(result).toHaveLength(2);
  });
});
