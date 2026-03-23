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
  buildWikipediaTitle,
  extractMovieTitlesFromWikitext,
  fetchAwardsFromOpenAI,
  resolveAwardsWithTMDb,
} from './generateAwardMovies';

// --- Helper ---

const testAwardDefinition: AwardDefinition = {
  label: 'テスト賞',
  month: 3,
  wikipediaTemplate: '第{edition}回テスト賞',
  firstEditionYear: 2000,
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

describe('buildWikipediaTitle', () => {
  it('回数ベースのテンプレートからタイトルを生成する', () => {
    const title = buildWikipediaTitle(2026, testAwardDefinition);
    expect(title).toBe('第26回テスト賞');
  });

  it('年ベースのテンプレートからタイトルを生成する', () => {
    const def: AwardDefinition = {
      ...testAwardDefinition,
      wikipediaTemplate: '{year}年のテスト映画祭',
      firstEditionYear: 0,
    };
    const title = buildWikipediaTitle(2026, def);
    expect(title).toBe('2026年のテスト映画祭');
  });
});

describe('extractMovieTitlesFromWikitext', () => {
  it('『』で囲まれたタイトルを抽出する', () => {
    const wikitext =
      "* '''[[吉沢亮]]''' - 『'''[[国宝 (映画)|国宝]]'''』\n** [[山田裕貴]] - 『[[爆弾 (小説)#映画|爆弾]]』";
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('国宝')).toBe(true);
    expect(titles.has('爆弾')).toBe(true);
  });

  it('[[]]リンクのみの行（作品賞形式）からタイトルを抽出する', () => {
    const wikitext =
      "* '''[[国宝 (映画)|国宝]]'''\n** [[宝島 (真藤順丈の小説)#映画|宝島]]\n** [[ファーストキス 1ST KISS]]";
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('国宝')).toBe(true);
    expect(titles.has('宝島')).toBe(true);
    expect(titles.has('ファーストキス 1ST KISS')).toBe(true);
  });

  it('賞名リンクは除外する', () => {
    const wikitext =
      "{{Award category|#eedd82|[[日本アカデミー賞主演男優賞|主演男優賞]]}}\n* '''[[吉沢亮]]''' - 『[[国宝 (映画)|国宝]]』";
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('主演男優賞')).toBe(false);
    expect(titles.has('国宝')).toBe(true);
  });

  it('太字マークアップを除去してタイトルを抽出する', () => {
    const wikitext = "* 『'''[[TOKYOタクシー]]'''』";
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('TOKYOタクシー')).toBe(true);
  });

  it('セクションリンク付きのタイトルを正しく解決する', () => {
    const wikitext = '** [[秒速5センチメートル#実写映画|秒速5センチメートル]]';
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('秒速5センチメートル')).toBe(true);
  });

  it('{{仮リンク}}テンプレート（label=あり）からタイトルを抽出する', () => {
    const wikitext =
      '** 『{{仮リンク|ハムネット (映画)|label=ハムネット|en|Hamnet (film)}}』\n** 『{{仮リンク|シークレット・エージェント (2025年の映画)|label=シークレット・エージェント|en|The Secret Agent (2025 film)}}』';
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('ハムネット')).toBe(true);
    expect(titles.has('シークレット・エージェント')).toBe(true);
  });

  it('{{仮リンク}}テンプレート（label=なし）からタイトルを抽出する', () => {
    const wikitext =
      "** [[ケイト・ハドソン]] - '{{仮リンク|ソング・サング・ブルー|en|Song Sung Blue (2025 film)}}' : クレア役";
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('ソング・サング・ブルー')).toBe(true);
  });

  it('{{仮リンク}}のlabel内の太字マークアップを除去する', () => {
    const wikitext =
      "* 『{{仮リンク|ハムネット (映画)|label='''ハムネット'''|en|Hamnet (film)}}』";
    const titles = extractMovieTitlesFromWikitext(wikitext);
    expect(titles.has('ハムネット')).toBe(true);
  });

  it('空のwikitextでは空のSetを返す', () => {
    const titles = extractMovieTitlesFromWikitext('');
    expect(titles.size).toBe(0);
  });
});

describe('buildUserPrompt', () => {
  const articleText = '== 受賞とノミネート ==\nテスト記事本文';

  it('年・賞名・部門を含むプロンプトを生成する', () => {
    const prompt = buildUserPrompt(
      2026,
      'アカデミー賞',
      testAwardDefinition.categories[0],
      articleText,
    );

    expect(prompt).toContain('2026年に授賞式が行われたアカデミー賞');
    expect(prompt).toContain('「作品賞」部門');
  });

  it('部門キーをそのまま使用するよう指示する', () => {
    const prompt = buildUserPrompt(
      2026,
      'テスト賞',
      testAwardDefinition.categories[0],
      articleText,
    );

    expect(prompt).toContain('"best_picture"');
  });

  it('記事本文がプロンプトに含まれる', () => {
    const prompt = buildUserPrompt(
      2026,
      'テスト賞',
      testAwardDefinition.categories[0],
      articleText,
    );

    expect(prompt).toContain('テスト記事本文');
  });
});

describe('fetchAwardsFromOpenAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testCategory = testAwardDefinition.categories[0];
  const testArticleText = '== テスト記事 ==\nテスト本文';

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
      testCategory,
      testArticleText,
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
      testCategory,
      testArticleText,
    );

    expect(result).toBeNull();
  });

  it('メッセージ出力がない場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({ output: [] });

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testCategory,
      testArticleText,
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
      testCategory,
      testArticleText,
    );

    expect(result).toBeNull();
  });

  it('不正なJSONレスポンスの場合、nullを返す', async () => {
    mockCreate.mockResolvedValue(createMockResponseOutput('not json'));

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testCategory,
      testArticleText,
    );

    expect(result).toBeNull();
  });

  it('zodバリデーション失敗の場合、nullを返す', async () => {
    mockCreate.mockResolvedValue(
      createMockResponseOutput(JSON.stringify({ awards: [{ invalid: true }] })),
    );

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testCategory,
      testArticleText,
    );

    expect(result).toBeNull();
  });

  it('API呼び出し失敗の場合、nullを返す', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const result = await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testCategory,
      testArticleText,
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
      testCategory,
      testArticleText,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
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

  it('日本語+year検索で見つかる場合、1回で解決する', async () => {
    mockSearchMovies.mockResolvedValueOnce({
      results: [
        {
          id: 200,
          title: 'テスト映画',
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
    expect(mockSearchMovies).toHaveBeenCalledTimes(1);
    expect(mockSearchMovies).toHaveBeenCalledWith({
      query: 'テスト映画',
      year: 2026,
    });
  });

  it('日本語+yearで見つからない場合、日本語のみ→英語+year→英語のみの順で検索する', async () => {
    mockSearchMovies
      .mockResolvedValueOnce({ results: [] }) // 日本語+year
      .mockResolvedValueOnce({ results: [] }) // 日本語のみ
      .mockResolvedValueOnce({ results: [] }) // 英語+year
      .mockResolvedValueOnce({
        // 英語のみ
        results: [
          {
            id: 201,
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
    expect(result[0].tmdb_movie_id).toBe(201);
    expect(mockSearchMovies).toHaveBeenCalledTimes(4);
    expect(mockSearchMovies).toHaveBeenCalledWith({
      query: 'テスト映画',
      year: 2026,
    });
    expect(mockSearchMovies).toHaveBeenCalledWith({ query: 'テスト映画' });
    expect(mockSearchMovies).toHaveBeenCalledWith({
      query: 'Test Movie',
      year: 2026,
    });
    expect(mockSearchMovies).toHaveBeenCalledWith({ query: 'Test Movie' });
  });

  it('全検索パターンで見つからない場合はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({ results: [] });

    const items = [createAwardItem()];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(0);
    expect(mockSearchMovies).toHaveBeenCalledTimes(4);
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

  it('公開年が一致する映画を優先して選択する', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 600,
          title: '同名映画（旧作）',
          poster_path: null,
          release_date: '2010-01-01',
          vote_average: 6.0,
          genre_ids: [18],
        },
        {
          id: 601,
          title: '同名映画（新作）',
          poster_path: null,
          release_date: '2026-05-01',
          vote_average: 8.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [createAwardItem({ year: 2026 })];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(601);
  });

  it('公開年一致がない場合は先頭結果にフォールバックする', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 700,
          title: 'フォールバック映画',
          poster_path: null,
          release_date: '2024-01-01',
          vote_average: 7.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [createAwardItem({ year: 2026 })];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(700);
  });

  it('display_orderが部門ごとの連番になる', async () => {
    mockSearchMovies.mockImplementation(
      async ({ query }: { query: string }) => ({
        results: [
          {
            id: query === '映画A' ? 801 : query === '映画B' ? 802 : 803,
            title: query,
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      }),
    );

    const items = [
      createAwardItem({
        title_ja: '映画A',
        title_en: 'Movie A',
        category: 'best_picture',
      }),
      createAwardItem({
        title_ja: '映画B',
        title_en: 'Movie B',
        category: 'best_picture',
        is_winner: false,
      }),
      createAwardItem({
        title_ja: '映画C',
        title_en: 'Movie C',
        category: 'best_director',
      }),
    ];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(3);
    // best_picture部門: 1, 2
    expect(result[0].display_order).toBe(1);
    expect(result[1].display_order).toBe(2);
    // best_director部門: 1（独立した連番）
    expect(result[2].display_order).toBe(1);
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
