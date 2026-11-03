/**
 * @jest-environment node
 */

/**
 * 受賞作品取得ロジック テスト
 */

import { AWARD_DEFINITIONS, type AwardDefinition } from '@/constants/awards';
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
const mockHasExcludedKeyword = jest.fn().mockResolvedValue(false);
const mockGetMovieKeywordIds = jest.fn().mockResolvedValue([]);
const mockGetMovieTitleAliases = jest.fn().mockResolvedValue([]);
jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: (...args: unknown[]) => mockSearchMovies(...args),
  hasExcludedKeyword: (...args: unknown[]) => mockHasExcludedKeyword(...args),
  getMovieKeywordIds: (...args: unknown[]) => mockGetMovieKeywordIds(...args),
  getMovieTitleAliases: (...args: unknown[]) =>
    mockGetMovieTitleAliases(...args),
}));

import { MUSIC_GENRE_ID } from '@/constants/movies';

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

  /**
   * 実在する記事名と突き合わせた値で固定する。
   * 定義を変えるとカンヌの同期が丸ごと0件になるため、
   * 実際の記事名を知らない後任が気づけるようにしておく。
   */
  it.each([
    [2024, '第77回カンヌ国際映画祭'],
    [2025, '第78回カンヌ国際映画祭'],
    [2026, '第79回カンヌ国際映画祭'],
    [1951, '第4回カンヌ国際映画祭'],
  ])('カンヌ %i年 → %s', (year, expected) => {
    expect(buildWikipediaTitle(year, AWARD_DEFINITIONS.cannes)).toBe(expected);
  });

  it.each([
    [2024, '第96回アカデミー賞'],
    [2025, '第82回ゴールデングローブ賞'],
  ])('%i年 → %s', (year, expected) => {
    const awardName = expected.includes('アカデミー')
      ? ('academy_awards' as const)
      : ('golden_globes' as const);
    expect(buildWikipediaTitle(year, AWARD_DEFINITIONS[awardName])).toBe(
      expected,
    );
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

  it('システムプロンプトにアダルト作品の除外指示が含まれる', async () => {
    mockCreate.mockResolvedValue(
      createMockResponseOutput(JSON.stringify({ awards: [] })),
    );

    await fetchAwardsFromOpenAI(
      2026,
      'テスト賞',
      testCategory,
      testArticleText,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.instructions).toContain('アダルト作品');
    expect(callArgs.instructions).toContain('抽出対象に含めないこと');
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

  describe('ライブ興行・舞台中継の除外', () => {
    it('ライブ映像を採用しないこと', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 940,
            title: 'ヨルシカ LIVE「盗作」',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [MUSIC_GENRE_ID],
          },
        ],
      });

      const result = await resolveAwardsWithTMDb(
        [
          createAwardItem({
            title_ja: 'ヨルシカ LIVE「盗作」',
            title_en: 'ヨルシカ LIVE「盗作」',
          }),
        ],
        testAwardDefinition,
      );

      expect(result).toHaveLength(0);
    });

    it('舞台中継を採用しないこと', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 941,
            title: 'National Theatre Live: Hamlet',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });

      const result = await resolveAwardsWithTMDb(
        [
          createAwardItem({
            title_ja: 'National Theatre Live: Hamlet',
            title_en: 'National Theatre Live: Hamlet',
          }),
        ],
        testAwardDefinition,
      );

      expect(result).toHaveLength(0);
    });

    it('タイトルに「ライブ」を含む劇映画は採用すること', async () => {
      // 『サタデー･ナイト／NYからライブ！』は Comedy/Drama のため候補外
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 942,
            title: 'サタデー･ナイト／NYからライブ！',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [35, 18],
          },
        ],
      });

      const result = await resolveAwardsWithTMDb(
        [
          createAwardItem({
            title_ja: 'サタデー･ナイト／NYからライブ！',
            title_en: 'Saturday Night',
          }),
        ],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(942);
    });
  });

  describe('アダルト作品の除外', () => {
    it('adult=trueの映画を採用しない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 930,
            title: 'Adult Movie',
            adult: true,
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 6.0,
            genre_ids: [18],
          },
        ],
      });

      const items = [createAwardItem()];
      const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

      expect(result).toHaveLength(0);
    });

    it('adult作品が先頭にあっても、後続の一般作品を採用する', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 931,
            title: 'テスト映画',
            adult: true,
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 5.0,
            genre_ids: [18],
          },
          {
            id: 932,
            title: 'テスト映画',
            adult: false,
            poster_path: '/poster.jpg',
            release_date: '2026-01-01',
            vote_average: 7.5,
            genre_ids: [28],
          },
        ],
      });

      const items = [createAwardItem()];
      const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(932);
    });

    it('フォールバック検索でもadultが除外される（英語タイトル経路）', async () => {
      // 日本語検索は全件adult、英語検索で一般作品がヒットするケース
      mockSearchMovies
        .mockResolvedValueOnce({
          results: [
            {
              id: 933,
              title: 'Adult',
              adult: true,
              poster_path: null,
              release_date: '2026-01-01',
              vote_average: 5.0,
              genre_ids: [18],
            },
          ],
        })
        .mockResolvedValueOnce({
          results: [
            {
              id: 934,
              title: 'Adult',
              adult: true,
              poster_path: null,
              release_date: '2026-01-01',
              vote_average: 5.0,
              genre_ids: [18],
            },
          ],
        })
        .mockResolvedValueOnce({
          results: [
            {
              id: 935,
              title: 'Test Movie',
              adult: false,
              poster_path: null,
              release_date: '2026-01-01',
              vote_average: 7.0,
              genre_ids: [28],
            },
          ],
        });

      const items = [createAwardItem()];
      const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(935);
    });

    it('全件adultの場合は1件も採用しない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 936,
            title: 'Adult A',
            adult: true,
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 5.0,
            genre_ids: [18],
          },
        ],
      });

      const items = [createAwardItem()];
      const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

      expect(result).toHaveLength(0);
    });
  });

  describe('除外キーワードによる除外', () => {
    it('除外キーワードを持つ映画を採用しない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 920,
            title: 'テスト映画',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 6.0,
            genre_ids: [18],
          },
        ],
      });
      mockHasExcludedKeyword.mockResolvedValueOnce(true);

      const items = [createAwardItem()];
      const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

      expect(result).toHaveLength(0);
    });

    it('キーワード判定は採用が確定する直前に1回だけ呼ばれる', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 921,
            title: 'テスト映画',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });
      mockHasExcludedKeyword.mockResolvedValue(false);

      const items = [createAwardItem()];
      const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

      expect(result).toHaveLength(1);
      expect(mockHasExcludedKeyword).toHaveBeenCalledTimes(1);
      expect(mockHasExcludedKeyword.mock.calls[0][0]).toBe(921);
    });

    it('キーワード判定が失敗した映画はスキップされる（fail-closed）', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 922,
            title: 'テスト映画',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });
      mockHasExcludedKeyword.mockRejectedValueOnce(new Error('TMDb error'));

      const items = [createAwardItem()];
      const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

      expect(result).toHaveLength(0);
    });
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
          title: 'テスト映画',
          poster_path: null,
          release_date: '2010-01-01',
          vote_average: 6.0,
          genre_ids: [18],
        },
        {
          id: 601,
          title: 'テスト映画',
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

  it('日本公開が翌年にずれていても本命を選ぶ', async () => {
    // 第96回アカデミー賞の実データ。TMDbクライアントは region=JP のため
    // 『オッペンハイマー』の release_date は日本公開日 2024-03-29 で返るが、
    // item.year は本国公開年 2023。翌年を許容しないと関連度1位を飛ばして
    // 同名の別作品（2023年日本公開のドキュメンタリー）を拾ってしまう
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 872585,
          title: 'オッペンハイマー',
          poster_path: '/oppenheimer.jpg',
          release_date: '2024-03-29',
          vote_average: 8.1,
          genre_ids: [18, 36],
        },
        {
          id: 1230570,
          title: 'オッペンハイマーの真実',
          poster_path: null,
          release_date: '2023-08-01',
          vote_average: 6.0,
          genre_ids: [99],
        },
      ],
    });

    const items = [
      createAwardItem({
        title_ja: 'オッペンハイマー',
        title_en: 'Oppenheimer',
        year: 2023,
      }),
    ];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(872585);
  });

  it('許容するずれは翌年までで、翌々年の候補は優先しない', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 610,
          title: 'テスト映画',
          poster_path: null,
          release_date: '2028-01-01',
          vote_average: 8.0,
          genre_ids: [18],
        },
        {
          id: 611,
          title: 'テスト映画',
          poster_path: null,
          release_date: '2026-05-01',
          vote_average: 6.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [createAwardItem({ year: 2026 })];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(611);
  });

  it('公開年が当年・翌年のいずれにも一致しない候補は採用しない', async () => {
    // 以前は `?? results[0]` で先頭を無条件採用していた。年もタイトルも
    // 手がかりが無い候補を採ると、無関係な作品が公開データに載る
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 700,
          title: 'テスト映画',
          poster_path: null,
          release_date: '2024-01-01',
          vote_average: 7.0,
          genre_ids: [18],
        },
      ],
    });

    const items = [createAwardItem({ year: 2026 })];
    const result = await resolveAwardsWithTMDb(items, testAwardDefinition);

    expect(result).toHaveLength(0);
  });

  describe('タイトルの照合', () => {
    it('title が一致すれば別名を問い合わせない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1000,
            title: 'テスト映画',
            original_title: 'Totally Different',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });

      const result = await resolveAwardsWithTMDb(
        [createAwardItem()],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(1000);
      expect(mockGetMovieTitleAliases).not.toHaveBeenCalled();
    });

    it('original_title が一致すれば採用する', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1001,
            title: '全く違う邦題',
            original_title: 'Test Movie',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });

      const result = await resolveAwardsWithTMDb(
        [createAwardItem()],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(1001);
    });

    it('title にも original_title にも無いが別名にあれば採用する', async () => {
      // 『ザ・ルーム・ネクスト・ドア』の実データ。邦題は日本語、原題はスペイン語で、
      // 検索語の英題はどちらとも一致しない。TMDbは別名・翻訳でヒットさせており、
      // その情報は検索レスポンスに含まれないため問い合わせが要る
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1088514,
            title: 'ザ・ルーム・ネクスト・ドア',
            original_title: 'La habitación de al lado',
            poster_path: null,
            release_date: '2024-10-07',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });
      mockGetMovieTitleAliases.mockResolvedValueOnce([
        'The Room Next Door',
        'La stanza accanto',
      ]);

      const result = await resolveAwardsWithTMDb(
        [
          createAwardItem({
            title_ja: 'ザ・ルーム・ネクスト・ドア',
            title_en: 'The Room Next Door',
            year: 2024,
          }),
        ],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(1088514);
    });

    it('どこにも一致しないタイトルの候補は採用しない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1002,
            title: '無関係な映画',
            original_title: 'Unrelated Movie',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });
      mockGetMovieTitleAliases.mockResolvedValue(['Something Else']);

      const result = await resolveAwardsWithTMDb(
        [createAwardItem()],
        testAwardDefinition,
      );

      expect(result).toHaveLength(0);
    });

    it('窓内の先頭がタイトル不一致でも、後続の一致する候補を採用する', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1003,
            title: '無関係な映画',
            original_title: 'Unrelated Movie',
            poster_path: null,
            release_date: '2026-02-01',
            vote_average: 9.0,
            genre_ids: [18],
          },
          {
            id: 1004,
            title: 'テスト映画',
            original_title: 'Test Movie',
            poster_path: null,
            release_date: '2026-03-01',
            vote_average: 5.0,
            genre_ids: [18],
          },
        ],
      });
      mockGetMovieTitleAliases.mockResolvedValue([]);

      const result = await resolveAwardsWithTMDb(
        [createAwardItem()],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(1004);
    });

    it('表記ゆれ（全角半角・大文字小文字・区切り記号）を吸収して一致とみなす', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1005,
            title: 'ＴＥＳＴ・ＭＯＶＩＥ',
            original_title: 'Unrelated',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });

      const result = await resolveAwardsWithTMDb(
        [
          createAwardItem({
            title_ja: 'test movie',
            title_en: 'test movie',
          }),
        ],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(1005);
    });

    /**
     * 第82回ゴールデングローブ賞の実データ。eiga.com は区切りに全角空白を使い、
     * TMDb は `/` を使う。`/` を正規化で落とさないと、同じ作品なのに
     * 一致せず候補が丸ごと弾かれる。
     */
    it.each([
      ['名もなき者　A COMPLETE UNKNOWN', '名もなき者/A COMPLETE UNKNOWN'],
      ['クィア QUEER', 'クィア／QUEER'],
      ['サタデー・ナイト NYからライブ！', 'サタデー･ナイト／NYからライブ！'],
    ])('区切りが空白と / で違っても一致とみなす: %s', async (source, tmdb) => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1007,
            title: tmdb,
            original_title: 'Unrelated Original',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });
      mockGetMovieTitleAliases.mockResolvedValue([]);

      const result = await resolveAwardsWithTMDb(
        [createAwardItem({ title_ja: source, title_en: source })],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(1007);
    });

    it('一度却下した映画を次の検索段で再判定しない', async () => {
      // 検索語を変えても同じ映画が返るのは普通。記録しないと同じ作品に対して
      // 最大4回ぶんの問い合わせを繰り返す
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 1006,
            title: 'テスト映画',
            original_title: 'Test Movie',
            poster_path: null,
            release_date: '2026-01-01',
            vote_average: 7.0,
            genre_ids: [18],
          },
        ],
      });
      mockHasExcludedKeyword.mockResolvedValue(true);

      const result = await resolveAwardsWithTMDb(
        [createAwardItem()],
        testAwardDefinition,
      );

      expect(result).toHaveLength(0);
      // 4段すべてで同じ映画が返るが、判定は1回だけ
      expect(mockHasExcludedKeyword).toHaveBeenCalledTimes(1);

      mockHasExcludedKeyword.mockResolvedValue(false);
    });

    it('第82回ゴールデングローブ賞『マリア』の実データで正しい作品を選ぶ', async () => {
      // OpenAI が抽出した邦題は「マリア・カラス」。この語では
      //   1. 日本語+year → 0件
      //   2. 日本語のみ  → 465871『私は、マリア・カラス』(2017年のドキュメンタリー)
      //   3. 英語+year   → 1038263 Maria (パブロ・ラライン、2024) ← 正解
      // となる。2 は公開年が窓外、かつタイトルも別名に無いため採ってはいけない
      mockSearchMovies
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({
          results: [
            {
              id: 465871,
              title: '私は、マリア・カラス',
              original_title: 'Maria by Callas',
              poster_path: null,
              release_date: '2018-12-21',
              vote_average: 7.0,
              genre_ids: [99],
            },
          ],
        })
        .mockResolvedValueOnce({
          results: [
            {
              id: 1038263,
              title: 'Maria',
              original_title: 'Maria',
              poster_path: '/maria.jpg',
              release_date: '2024-11-27',
              vote_average: 6.8,
              genre_ids: [18],
            },
          ],
        });

      const result = await resolveAwardsWithTMDb(
        [
          createAwardItem({
            title_ja: 'マリア・カラス',
            title_en: 'Maria',
            year: 2024,
          }),
        ],
        testAwardDefinition,
      );

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(1038263);
    });
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
