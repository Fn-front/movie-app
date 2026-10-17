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
    responses: { create: mockCreate },
  })),
  getOpenAIModel: jest.fn(() => 'gpt-4o-mini'),
}));

const mockSearchMovies = jest.fn();
const mockHasExcludedKeyword = jest.fn().mockResolvedValue(false);
jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: (...args: unknown[]) => mockSearchMovies(...args),
  hasExcludedKeyword: (...args: unknown[]) => mockHasExcludedKeyword(...args),
}));

import {
  buildUserPrompt,
  fetchRecommendationsFromOpenAI,
  resolveRecommendationsWithTMDb,
} from './generateRecommendations';

/** AIレスポンスとして保持される最大件数（最大表示件数＋取りこぼし用バッファ） */
const MAX_RESPONSE_COUNT =
  RECOMMENDATIONS_MAX_COUNT + RECOMMENDATIONS_GENERATION_BUFFER;

// --- Helper ---

/** responses.create のレスポンス形状を組み立てる */
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

/** AIレコメンド1件分のレスポンスを返すようモックを設定する */
function mockRecommendations(
  items: { title_ja: string; title_en: string; year: number; reason: string }[],
) {
  mockCreate.mockResolvedValue(
    createMockResponseOutput(JSON.stringify({ recommendations: items })),
  );
}

/** TMDb検索結果の1件分を組み立てる（original_title は未指定なら title と同じ） */
function createSearchResult(
  overrides: Partial<{
    id: number;
    title: string;
    original_title: string;
    adult: boolean;
    poster_path: string | null;
    release_date: string;
    vote_average: number;
    vote_count: number;
    genre_ids: number[];
  }> = {},
) {
  const title = overrides.title ?? 'Movie';
  return {
    id: 100,
    adult: false,
    poster_path: null,
    release_date: '2020-01-01',
    vote_average: 7.0,
    vote_count: 100,
    genre_ids: [28],
    ...overrides,
    title,
    original_title: overrides.original_title ?? title,
  };
}

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
    expect(prompt).toContain('## 既に見た作品');
    expect(prompt).toContain('- インターステラー');
  });

  it('評価がnullの場合、評価を表示しない', () => {
    const favorites = [{ title: 'テスト映画', rating: null }];
    const prompt = buildUserPrompt(favorites, []);

    expect(prompt).toContain('- テスト映画');
    expect(prompt).not.toContain('評価');
  });

  it('既に見た作品が空の場合、該当セクションを含めない', () => {
    const favorites = [{ title: 'テスト映画', rating: 5 }];
    const prompt = buildUserPrompt(favorites, []);

    expect(prompt).not.toContain('## 既に見た作品');
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
    mockRecommendations([
      {
        title_ja: 'メッセージ',
        title_en: 'Arrival',
        year: 2016,
        reason: 'SF好きにおすすめ',
      },
    ]);

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'インターステラー', rating: 9 }],
      ['インターステラー'],
    );

    expect(result).toHaveLength(1);
    expect(result![0].title_ja).toBe('メッセージ');
    expect(result![0].title_en).toBe('Arrival');
    expect(result![0].reason).toBe('SF好きにおすすめ');
  });

  it('strict json_schema で邦題・原題を必須指定している', async () => {
    mockRecommendations([
      { title_ja: '邦題', title_en: 'Title', year: 2016, reason: '理由' },
    ]);

    await fetchRecommendationsFromOpenAI([{ title: 'テスト', rating: 5 }], []);

    const format = mockCreate.mock.calls[0][0].text.format;
    expect(format.type).toBe('json_schema');
    expect(format.strict).toBe(true);
    expect(format.schema.properties.recommendations.items.required).toEqual([
      'title_ja',
      'title_en',
      'year',
      'reason',
    ]);
  });

  it('システムプロンプトにアダルト作品の除外指示が含まれる', async () => {
    mockRecommendations([
      { title_ja: '邦題', title_en: 'Title', year: 2016, reason: '理由' },
    ]);

    await fetchRecommendationsFromOpenAI([{ title: 'テスト', rating: 5 }], []);

    expect(mockCreate.mock.calls[0][0].instructions).toContain('アダルト作品');
  });

  it('システムプロンプトが同名の別作品を許容すると明示している', async () => {
    // タイトル文字列での一律除外は、同名リメイクまで巻き添えにするため
    mockRecommendations([
      { title_ja: '邦題', title_en: 'Title', year: 2016, reason: '理由' },
    ]);

    await fetchRecommendationsFromOpenAI([{ title: 'テスト', rating: 5 }], []);

    expect(mockCreate.mock.calls[0][0].instructions).toContain('同名の別作品');
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

  it('message出力が無い場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({ output: [] });

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('output_textが無い場合、nullを返す', async () => {
    mockCreate.mockResolvedValue({
      output: [{ type: 'message', content: [{ type: 'refusal' }] }],
    });

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('不正なJSONレスポンスの場合、nullを返す', async () => {
    mockCreate.mockResolvedValue(createMockResponseOutput('not json'));

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).toBeNull();
  });

  it('zodバリデーション失敗の場合、nullを返す', async () => {
    mockCreate.mockResolvedValue(
      createMockResponseOutput(
        JSON.stringify({ recommendations: [{ invalid: true }] }),
      ),
    );

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
    mockRecommendations([
      { title_ja: '邦題', title_en: 'Movie A', year: 2020, reason: '理由' },
    ]);

    await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
      3,
    );

    expect(mockCreate.mock.calls[0][0].instructions).toContain('3件推薦');
  });

  it('OpenAIが上限を超える件数を返しても、nullにせず上限件数に切り詰めて返す', async () => {
    // LLMは要求件数を厳密に守らず超過して返すことがある。
    // 以前は上限超過でzod検証に失敗しnullを返し、cronが丸ごと失敗していた。
    mockRecommendations(
      Array.from({ length: MAX_RESPONSE_COUNT + 1 }, (_, i) => ({
        title_ja: `映画${i + 1}`,
        title_en: `Movie ${i + 1}`,
        year: 2020,
        reason: `理由${i + 1}`,
      })),
    );

    const result = await fetchRecommendationsFromOpenAI(
      [{ title: 'テスト', rating: 5 }],
      [],
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(MAX_RESPONSE_COUNT);
    expect(result![0].title_ja).toBe('映画1');
  });
});

describe('resolveRecommendationsWithTMDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchMovies.mockReset();
    mockHasExcludedKeyword.mockReset().mockResolvedValue(false);
  });

  const createItem = (
    titleJa: string,
    year: number,
    reason: string,
    titleEn = `${titleJa} EN`,
  ): OpenAiRecommendationItem => ({
    title_ja: titleJa,
    title_en: titleEn,
    year,
    reason,
  });

  it('TMDb検索結果から映画情報を解決する', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [
        createSearchResult({
          id: 100,
          title: 'メッセージ',
          poster_path: '/arrival.jpg',
          release_date: '2016-11-11',
          vote_average: 7.9,
          genre_ids: [878, 18],
        }),
      ],
    });

    const items = [createItem('メッセージ', 2016, 'SF好きにおすすめ')];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].tmdb_movie_id).toBe(100);
    expect(result[0].title).toBe('メッセージ');
    expect(result[0].display_order).toBe(1);
    expect(result[0].reason).toBe('SF好きにおすすめ');
  });

  describe('邦題→原題のフォールバック検索', () => {
    it('邦題で0件の場合、原題で再検索して解決する', async () => {
      // 「ナイト・クローラー」のような表記揺れでTMDbに一致しないケース
      mockSearchMovies
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({
          results: [
            createSearchResult({
              id: 242582,
              title: 'ナイトクローラー',
              release_date: '2014-10-23',
            }),
          ],
        });

      const items = [
        createItem('ナイト・クローラー', 2014, '理由', 'Nightcrawler'),
      ];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(242582);
      expect(mockSearchMovies).toHaveBeenCalledTimes(2);
      expect(mockSearchMovies.mock.calls[0][0].query).toBe(
        'ナイト・クローラー',
      );
      expect(mockSearchMovies.mock.calls[1][0].query).toBe('Nightcrawler');
    });

    it('邦題で公開年が一致しない場合も、原題で再検索する', async () => {
      mockSearchMovies
        .mockResolvedValueOnce({
          results: [
            createSearchResult({
              id: 1,
              title: '別作品',
              release_date: '1993-08-14',
            }),
          ],
        })
        .mockResolvedValueOnce({
          results: [
            createSearchResult({
              id: 2,
              title: '目的の作品',
              release_date: '2021-05-01',
            }),
          ],
        });

      const items = [createItem('アクション・ヒーロー', 2021, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(2);
    });

    it('邦題が厳密一致した場合、原題では検索しない（TMDb呼び出し削減）', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 300,
            title: '邦題あり',
            release_date: '2020-03-01',
          }),
        ],
      });

      const items = [createItem('邦題あり', 2020, '理由')];
      await resolveRecommendationsWithTMDb(items, new Set());

      expect(mockSearchMovies).toHaveBeenCalledTimes(1);
    });

    it('中黒の有無だけが違う邦題は厳密一致として扱う', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 242582,
            title: 'ナイトクローラー',
            release_date: '2014-10-23',
          }),
        ],
      });

      const items = [
        createItem('ナイト・クローラー', 2014, '理由', 'Nightcrawler'),
      ];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(mockSearchMovies).toHaveBeenCalledTimes(1);
    });

    it('邦題と原題が同一の場合、同じクエリで2回検索しない', async () => {
      mockSearchMovies.mockResolvedValue({ results: [] });

      const items = [createItem('Memoria', 2021, '理由', 'Memoria')];
      await resolveRecommendationsWithTMDb(items, new Set());

      expect(mockSearchMovies).toHaveBeenCalledTimes(1);
    });
  });

  describe('公開年が一致しない候補の棄却', () => {
    it('公開年が一致する候補を関連度順より優先して選択する', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 1,
            title: 'DUNE/デューン',
            release_date: '1984-12-14',
          }),
          createSearchResult({
            id: 2,
            title: 'DUNE/デューン',
            release_date: '2021-09-15',
          }),
        ],
      });

      const items = [createItem('DUNE/デューン', 2021, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(2);
    });

    it('公開年が許容範囲外しかない場合は棄却する（同名別作品の誤採用を防ぐ）', async () => {
      // 以前は関連度順の先頭にフォールバックし、
      // 「アクション・ヒーロー(2021)」に「ラスト・アクション・ヒーロー(1993)」を割り当てていた
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 10,
            title: 'ラスト・アクション・ヒーロー',
            release_date: '1993-08-14',
          }),
        ],
      });

      const items = [createItem('アクション・ヒーロー', 2021, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(0);
    });

    it('公開年の差が許容範囲（±1年）なら採用する', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [createSearchResult({ id: 20, release_date: '2019-12-20' })],
      });

      const items = [createItem('年ズレ作品', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(20);
    });

    it('release_dateが空文字の候補は棄却する', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [createSearchResult({ id: 30, release_date: '' })],
      });

      const items = [createItem('公開日不明作品', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(0);
    });

    it('棄却された候補ではキーワード判定を呼ばない（TMDb呼び出し削減）', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [createSearchResult({ id: 40, release_date: '1990-01-01' })],
      });

      const items = [createItem('年不一致', 2020, '理由')];
      await resolveRecommendationsWithTMDb(items, new Set());

      expect(mockHasExcludedKeyword).not.toHaveBeenCalled();
    });
  });

  describe('タイトル厳密一致の優先', () => {
    it('公開年が一致していても、検索語を含むだけの別作品より厳密一致を優先する', async () => {
      // 「The Purge」で検索すると同年の「The Purge: The Morning After」が
      // 関連度順で先に来て、本来の「パージ」を追い越す
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 1,
            title: 'The Purge: The Morning After',
            release_date: '2013-09-04',
          }),
          createSearchResult({
            id: 2,
            title: 'パージ',
            original_title: 'The Purge',
            release_date: '2013-06-07',
          }),
        ],
      });

      const items = [createItem('パージ', 2013, '理由', 'The Purge')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(2);
    });

    it('邦題で厳密一致しない場合、原題の厳密一致を関連度順より優先する', async () => {
      // 邦題検索では「Digitaria Ex Machina」しか当たらないが、
      // 原題「Ex Machina」の厳密一致がある方を採用する
      mockSearchMovies
        .mockResolvedValueOnce({
          results: [
            createSearchResult({
              id: 1,
              title: 'Digitaria Ex Machina',
              release_date: '2015-10-20',
            }),
          ],
        })
        .mockResolvedValueOnce({
          results: [
            createSearchResult({
              id: 2,
              title: 'エクス・マキナ',
              original_title: 'Ex Machina',
              release_date: '2015-04-10',
            }),
          ],
        });

      const items = [createItem('エクス・マキナ', 2015, '理由', 'Ex Machina')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(2);
    });

    it('邦題・原題とも厳密一致が無い場合は、関連度最上位の年一致候補を採用する', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 50,
            title: '表記の異なる邦題',
            release_date: '2020-02-01',
          }),
        ],
      });

      const items = [createItem('AIが返した邦題', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(50);
    });
  });

  describe('アダルト作品の除外', () => {
    it('adult=trueの映画を採用しない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 900,
            adult: true,
            release_date: '2020-01-01',
          }),
        ],
      });

      const items = [createItem('Adult Movie', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(0);
    });

    it('adult作品が先頭にあっても、後続の一般作品を採用する', async () => {
      // 同名のアダルト作品がTMDb検索の先頭に来るケース
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 901,
            adult: true,
            release_date: '2020-01-01',
          }),
          createSearchResult({
            id: 902,
            adult: false,
            release_date: '2020-05-01',
          }),
        ],
      });

      const items = [createItem('Same Title', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(result[0].tmdb_movie_id).toBe(902);
    });

    it('全件adultの場合は1件も採用しない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          createSearchResult({
            id: 903,
            adult: true,
            release_date: '2020-01-01',
          }),
          createSearchResult({
            id: 904,
            adult: true,
            release_date: '2021-01-01',
          }),
        ],
      });

      const items = [createItem('Adult A', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(0);
    });
  });

  describe('除外キーワードによる除外', () => {
    it('除外キーワードを持つ映画を採用しない', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [createSearchResult({ id: 910, release_date: '2020-01-01' })],
      });
      mockHasExcludedKeyword.mockResolvedValueOnce(true);

      const items = [createItem('Keyword Adult Movie', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(0);
    });

    it('キーワード判定は採用が確定する直前に1回だけ呼ばれる', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [createSearchResult({ id: 911, release_date: '2020-01-01' })],
      });

      const items = [createItem('Movie', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(1);
      expect(mockHasExcludedKeyword).toHaveBeenCalledTimes(1);
      expect(mockHasExcludedKeyword.mock.calls[0][0]).toBe(911);
    });

    it('除外リストに含まれる映画ではキーワード判定を呼ばない（TMDb呼び出し削減）', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [createSearchResult({ id: 912, release_date: '2020-01-01' })],
      });

      const items = [createItem('Excluded', 2020, '理由')];
      await resolveRecommendationsWithTMDb(items, new Set([912]));

      expect(mockHasExcludedKeyword).not.toHaveBeenCalled();
    });

    it('キーワード判定が失敗した映画はスキップされる（fail-closed）', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [createSearchResult({ id: 913, release_date: '2020-01-01' })],
      });
      mockHasExcludedKeyword.mockRejectedValueOnce(new Error('TMDb error'));

      const items = [createItem('Movie', 2020, '理由')];
      const result = await resolveRecommendationsWithTMDb(items, new Set());

      expect(result).toHaveLength(0);
    });
  });

  it('検索結果がない場合はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({ results: [] });

    const items = [createItem('Unknown Movie', 2020, '理由')];
    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(0);
  });

  it('除外リストに含まれる映画はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [createSearchResult({ id: 200, release_date: '2020-01-01' })],
    });

    const items = [createItem('Already Favorite', 2020, '理由')];
    const result = await resolveRecommendationsWithTMDb(items, new Set([200]));

    expect(result).toHaveLength(0);
  });

  it('重複する映画はスキップする', async () => {
    mockSearchMovies.mockResolvedValue({
      results: [createSearchResult({ id: 300, release_date: '2020-01-01' })],
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
          createSearchResult({
            id: 400,
            title: 'Movie B',
            release_date: '2021-01-01',
          }),
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

  /**
   * 連番の映画をそれぞれ邦題の厳密一致で解決できるようモックを設定する
   * （厳密一致すれば原題検索は走らないため、1項目=1検索になる）
   */
  const mockSequentialMovies = (count: number) => {
    const items: OpenAiRecommendationItem[] = [];
    for (let i = 1; i <= count; i++) {
      items.push(createItem(`Movie ${i}`, 2020, `理由${i}`));
      mockSearchMovies.mockResolvedValueOnce({
        results: [
          createSearchResult({
            id: i,
            title: `Movie ${i}`,
            release_date: '2020-01-01',
          }),
        ],
      });
    }
    return items;
  };

  it('最大10件で打ち切る', async () => {
    const items = mockSequentialMovies(12);

    const result = await resolveRecommendationsWithTMDb(items, new Set());

    expect(result).toHaveLength(10);
  });

  it('limit引数で指定件数で打ち切る', async () => {
    const items = mockSequentialMovies(5);

    const result = await resolveRecommendationsWithTMDb(items, new Set(), 2);

    expect(result).toHaveLength(2);
  });

  it('中断シグナルが立っている場合はTMDb検索を行わない', async () => {
    const controller = new AbortController();
    controller.abort();

    const items = [createItem('Movie', 2020, '理由')];
    const result = await resolveRecommendationsWithTMDb(
      items,
      new Set(),
      RECOMMENDATIONS_MAX_COUNT,
      controller.signal,
    );

    expect(result).toHaveLength(0);
    expect(mockSearchMovies).not.toHaveBeenCalled();
  });
});
