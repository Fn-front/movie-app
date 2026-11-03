/**
 * @jest-environment node
 */

/**
 * 受賞作品同期サービス テスト
 */

import type { ResolvedAwardMovie } from '@/lib/openai/generateAwardMovies';

// --- Mocks ---

const mockFetchAwardsFromOpenAI = jest.fn();
const mockResolveAwardsWithTMDb = jest.fn();
const mockBuildWikipediaTitle = jest
  .fn<string, [unknown, unknown]>()
  .mockReturnValue('第26回テスト賞');
const mockExtractMovieTitlesFromWikitext = jest.fn<Set<string>, [string]>();
jest.mock('@/lib/openai/generateAwardMovies', () => ({
  fetchAwardsFromOpenAI: (...args: unknown[]) =>
    mockFetchAwardsFromOpenAI(...args),
  resolveAwardsWithTMDb: (...args: unknown[]) =>
    mockResolveAwardsWithTMDb(...args),
  buildWikipediaTitle: (a: unknown, b: unknown) =>
    mockBuildWikipediaTitle(a, b),
  extractMovieTitlesFromWikitext: (text: string) =>
    mockExtractMovieTitlesFromWikitext(text),
}));

const mockFetchWikipediaArticle = jest.fn();
jest.mock('@/lib/wikipedia/fetchArticle', () => ({
  fetchWikipediaArticle: (...args: unknown[]) =>
    mockFetchWikipediaArticle(...args),
}));

const mockFetchEigaOscarAwards = jest.fn();
jest.mock('@/lib/eiga/fetchEigaOscarAwards', () => ({
  fetchEigaOscarAwards: (...args: unknown[]) =>
    mockFetchEigaOscarAwards(...args),
}));

const mockFetchEigaGoldenGlobes = jest.fn();
jest.mock('@/lib/eiga/fetchEigaGoldenGlobes', () => ({
  fetchEigaGoldenGlobes: (...args: unknown[]) =>
    mockFetchEigaGoldenGlobes(...args),
}));

import {
  getAwardsForMonth,
  executeSyncAwardMoviesCron,
  syncSingleAward,
} from './syncAwardMoviesService';
import { AWARD_DEFINITIONS } from '@/constants/awards';

// --- Helper ---

/**
 * ゴールデングローブ賞は eiga.com から取る（OpenAIもWikipediaも通らない）。
 * 抽出ロジックの検証は `src/lib/eiga/fetchEigaGoldenGlobes.test.ts` で行う。
 */
const GOLDEN_GLOBES_ITEMS = [
  {
    title_ja: 'テスト映画',
    title_en: 'テスト映画',
    category: 'best_drama',
    is_winner: true,
    year: 2025,
  },
  {
    title_ja: 'テスト映画2',
    title_en: 'テスト映画2',
    category: 'best_drama',
    is_winner: false,
    year: 2025,
  },
];

/**
 * カンヌ映画祭のwikitext（最小形）
 *
 * ゴールデングローブ賞と同じく OpenAI を通さないが、記事構造が違うため
 * 別のパーサを通る。パーサ自体の検証は
 * `src/lib/wikipedia/parseCannesAwards.test.ts` で行う。
 */
const CANNES_WIKITEXT = `==受賞作品==
=== 公式選出 ===
; コンペティション
* [[パルム・ドール]] - 『[[テスト映画]]』（[[テスト監督]]監督）`;

function createMockSupabase(upsertResult = { error: null }) {
  return {
    from: jest.fn(() => ({
      upsert: jest.fn(() => upsertResult),
    })),
  } as unknown as Parameters<typeof executeSyncAwardMoviesCron>[0];
}

function createResolvedMovie(
  overrides: Partial<ResolvedAwardMovie> = {},
): ResolvedAwardMovie {
  return {
    tmdb_movie_id: 100,
    title: 'テスト映画',
    poster_path: '/poster.jpg',
    release_date: '2026-01-01',
    vote_average: 8.5,
    vote_count: 1200,
    genre_ids: [18],
    category: 'best_picture',
    is_winner: true,
    display_order: 1,
    ...overrides,
  };
}

// --- Tests ---

describe('getAwardsForMonth', () => {
  it('1月はゴールデングローブ賞を返す', () => {
    const awards = getAwardsForMonth(1);
    expect(awards.length).toBe(1);
    expect(awards[0][0]).toBe('golden_globes');
  });

  it('3月はアカデミー賞を返す（日本アカデミー賞は除外）', () => {
    const awards = getAwardsForMonth(3);
    expect(awards.length).toBe(1);
    expect(awards[0][0]).toBe('academy_awards');
  });

  it('5月はカンヌ映画祭を返す', () => {
    const awards = getAwardsForMonth(5);
    expect(awards.length).toBe(1);
    expect(awards[0][0]).toBe('cannes');
  });

  it('該当する賞がない月は空配列を返す', () => {
    const awards = getAwardsForMonth(7);
    expect(awards).toHaveLength(0);
  });
});

describe('executeSyncAwardMoviesCron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // デフォルトでWikipedia記事が取得できる状態
    mockFetchWikipediaArticle.mockResolvedValue('== テスト記事 ==');
    // デフォルトですべてのタイトルを許可
    mockExtractMovieTitlesFromWikitext.mockReturnValue(
      new Set(['テスト映画', 'テスト']),
    );
    // デフォルトでeiga.comが空配列を返す状態
    mockFetchEigaOscarAwards.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('該当月の賞がない場合はスキップする', async () => {
    // 7月に設定（該当する賞なし）
    jest.setSystemTime(new Date('2026-07-15T00:00:00Z'));

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('skipped');
    if (result.type === 'skipped') {
      expect(result.data.month).toBe(7);
      expect(result.data.reason).toContain('該当する賞はありません');
    }
  });

  it('該当月の賞について正常に同期する', async () => {
    // 1月に設定（ゴールデングローブ賞）
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchEigaGoldenGlobes.mockResolvedValue(GOLDEN_GLOBES_ITEMS);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.synced_awards).toContain('golden_globes');
      expect(result.data.total_upserted).toBeGreaterThan(0);
    }
  });

  it('ゴールデングローブ賞はeiga.comから取得し、OpenAIもWikipediaも使わない', async () => {
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchEigaGoldenGlobes.mockResolvedValue(GOLDEN_GLOBES_ITEMS);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    await executeSyncAwardMoviesCron(supabase);

    expect(mockFetchEigaGoldenGlobes).toHaveBeenCalledWith(2026);
    expect(mockFetchAwardsFromOpenAI).not.toHaveBeenCalled();
    expect(mockFetchWikipediaArticle).not.toHaveBeenCalled();

    // eiga.com から読んだ内容がそのまま解決へ渡る
    const items = mockResolveAwardsWithTMDb.mock.calls[0][0];
    expect(items.map((i: { title_ja: string }) => i.title_ja)).toEqual([
      'テスト映画',
      'テスト映画2',
    ]);
    expect(items[0].is_winner).toBe(true);
    expect(items[1].is_winner).toBe(false);
  });

  it('カンヌ映画祭でもOpenAIを呼ばず、全件を受賞として扱う', async () => {
    // 5月（カンヌ）
    jest.setSystemTime(new Date('2026-05-15T00:00:00Z'));

    mockFetchWikipediaArticle.mockResolvedValue(CANNES_WIKITEXT);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    await executeSyncAwardMoviesCron(supabase);

    expect(mockFetchAwardsFromOpenAI).not.toHaveBeenCalled();

    const items = mockResolveAwardsWithTMDb.mock.calls[0][0];
    expect(items).toEqual([
      expect.objectContaining({
        title_ja: 'テスト映画',
        category: 'palme_dor',
        is_winner: true,
        person_name: 'テスト監督',
      }),
    ]);
  });

  it('ゴールデングローブ賞でeiga.comが0件を返した場合はスキップする', async () => {
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchEigaGoldenGlobes.mockResolvedValue([]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards).toContain('golden_globes');
    }
    // 静かに OpenAI 経路へ落ちない
    expect(mockFetchAwardsFromOpenAI).not.toHaveBeenCalled();
  });

  it('OpenAIが全部門で空結果を返した場合は該当賞をスキップする', async () => {
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    // 全部門でnullを返す（リトライ含む）
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards).toContain('golden_globes');
      expect(result.data.synced_awards).toHaveLength(0);
    }
  });

  it('TMDb解決が空結果の場合は該当賞をスキップする', async () => {
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト',
        title_en: 'Test',
        category: 'best_drama',
        is_winner: true,
        year: 2025,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards).toContain('golden_globes');
    }
  });

  it('UPSERT失敗時は該当賞をスキップする', async () => {
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト',
        title_en: 'Test',
        category: 'best_drama',
        is_winner: true,
        year: 2025,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase({
      error: { message: 'DB error' },
    } as never);
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards).toContain('golden_globes');
    }
  });

  it('処理中にエラーが発生しても他の賞の処理は続行する', async () => {
    // 1月に設定（ゴールデングローブ賞のみ）
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchWikipediaArticle.mockResolvedValue('== テスト記事 ==');
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト']));
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    mockResolveAwardsWithTMDb.mockResolvedValue([]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards).toContain('golden_globes');
    }
  });

  it('targetYear指定時はアカデミー賞のみeiga.com経由で同期する', async () => {
    jest.setSystemTime(new Date('2026-07-15T00:00:00Z'));

    // eiga.comが受賞作品を返す
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'テスト映画',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase, 2025);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.year).toBe(2025);
      expect(result.data.month).toBeNull();
      expect(result.data.synced_awards).toEqual(['academy_awards']);
    }
    // アカデミー賞のみeiga.comを使用、Wikipedia/OpenAIは呼ばれない
    expect(mockFetchEigaOscarAwards).toHaveBeenCalledWith(2025);
    expect(mockFetchWikipediaArticle).not.toHaveBeenCalled();
  });

  it('アカデミー賞はeiga.comからデータを取得する', async () => {
    jest.setSystemTime(new Date('2026-03-15T00:00:00Z'));

    // eiga.comが受賞作品を返す
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'テスト映画',
        category: 'best_picture',
        is_winner: true,
        year: 2025,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.synced_awards).toContain('academy_awards');
    }
    // eiga.comが呼ばれたことを確認
    expect(mockFetchEigaOscarAwards).toHaveBeenCalledWith(2026);
    // アカデミー賞ではWikipediaが呼ばれない（日本アカデミー賞は除外済み）
    expect(mockFetchWikipediaArticle).not.toHaveBeenCalled();
  });

  it('eiga.comが0件の場合はWikipedia+OpenAIにフォールバックする', async () => {
    jest.setSystemTime(new Date('2026-03-15T00:00:00Z'));

    // eiga.comが空配列を返す
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    // Wikipedia+OpenAIが結果を返す
    mockFetchWikipediaArticle.mockResolvedValue('== テスト記事 ==');
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));
    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test Movie',
        category: 'best_picture',
        is_winner: true,
        year: 2025,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.synced_awards).toContain('academy_awards');
    }
    // eiga.comが呼ばれた後、Wikipediaにフォールバック
    expect(mockFetchEigaOscarAwards).toHaveBeenCalled();
    expect(mockFetchWikipediaArticle).toHaveBeenCalled();
  });

  it('wikitextに存在しないタイトルはハルシネーションとして除外する', async () => {
    // Wikipedia+OpenAI 経路に残っているのは、アカデミー賞が eiga.com の
    // 取得に失敗したときのフォールバックだけ。他の賞は wikitext を直接
    // パースするためこの経路を通らない
    jest.setSystemTime(new Date('2026-07-15T00:00:00Z'));
    mockFetchEigaOscarAwards.mockResolvedValue([]);

    // wikitextには「テスト映画」のみ存在
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));

    // 最初の部門のみ正常+ハルシネーションを返し、残りはnull
    mockFetchAwardsFromOpenAI
      .mockResolvedValueOnce([
        {
          title_ja: 'テスト映画',
          title_en: 'Test Movie',
          category: 'best_picture',
          is_winner: true,
          year: 2025,
        },
        {
          title_ja: 'ハルシネーション映画',
          title_en: 'Hallucinated Movie',
          category: 'best_picture',
          is_winner: false,
          year: 2025,
        },
      ])
      .mockResolvedValue(null);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    await executeSyncAwardMoviesCron(supabase, 2026);

    // resolveAwardsWithTMDbに渡されるアイテムからハルシネーションが除外されている
    const resolveCallArgs = mockResolveAwardsWithTMDb.mock.calls[0][0];
    expect(resolveCallArgs).toHaveLength(1);
    expect(resolveCallArgs[0].title_ja).toBe('テスト映画');
  });

  it('yearが授賞式年から大きく外れている場合は補正する', async () => {
    // 同上。アカデミー賞の eiga.com フォールバック経路で検証する
    jest.setSystemTime(new Date('2026-07-15T00:00:00Z'));
    mockFetchEigaOscarAwards.mockResolvedValue([]);

    mockExtractMovieTitlesFromWikitext.mockReturnValue(
      new Set(['秒速5センチメートル']),
    );

    mockFetchAwardsFromOpenAI
      .mockResolvedValueOnce([
        {
          title_ja: '秒速5センチメートル',
          title_en: '5 Centimeters Per Second',
          category: 'best_picture',
          is_winner: false,
          year: 2007,
        },
      ])
      .mockResolvedValue(null);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    await executeSyncAwardMoviesCron(supabase, 2026);

    const resolveCallArgs = mockResolveAwardsWithTMDb.mock.calls[0][0];
    expect(resolveCallArgs[0].year).toBe(2025);
  });
});

describe('syncSingleAward', () => {
  /** upsert の引数を検査できる supabase モック */
  function createCapturingSupabase(
    upsertResult: { error: unknown } = { error: null },
  ) {
    const upsert = jest.fn().mockResolvedValue(upsertResult);
    const supabase = {
      from: jest.fn(() => ({ upsert })),
    } as unknown as Parameters<typeof syncSingleAward>[0];

    return { supabase, upsert };
  }

  const params = {
    awardName: 'academy_awards' as const,
    awardDef: AWARD_DEFINITIONS.academy_awards,
    year: 2025,
    generatedAt: '2026-10-31T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWikipediaArticle.mockResolvedValue('== テスト記事 ==');
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));
    mockFetchEigaOscarAwards.mockResolvedValue([]);
  });

  it('generatedAt を引数で受け取り、生成した行すべてに同じ値を入れる', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([
      createResolvedMovie({ tmdb_movie_id: 1 }),
      createResolvedMovie({ tmdb_movie_id: 2, display_order: 2 }),
    ]);
    const { supabase, upsert } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'synced', upsertedCount: 2 });

    const rows = upsert.mock.calls[0][0] as { generated_at: string }[];
    expect(rows).toHaveLength(2);
    expect(
      rows.every((r) => r.generated_at === '2026-10-31T00:00:00.000Z'),
    ).toBe(true);
  });

  it('取得0件を no_items として返し、DBに触らない', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    mockFetchWikipediaArticle.mockResolvedValue(null);
    const { supabase, upsert } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'no_items' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('TMDb解決0件を no_tmdb_match として返し、DBに触らない', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([]);
    const { supabase, upsert } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'no_tmdb_match' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('UPSERT 失敗を write_failed として返す', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);
    const { supabase } = createCapturingSupabase({
      error: { message: 'boom' },
    });

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'write_failed', error: 'boom' });
  });

  it('同じユニークキーの重複行を除外する', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    // 同一 tmdb_movie_id × 同一 category が2件返る
    mockResolveAwardsWithTMDb.mockResolvedValue([
      createResolvedMovie({ tmdb_movie_id: 1 }),
      createResolvedMovie({
        tmdb_movie_id: 1,
        is_winner: false,
        display_order: 2,
      }),
    ]);
    const { supabase, upsert } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'synced', upsertedCount: 1 });
    expect(upsert.mock.calls[0][0]).toHaveLength(1);
  });

  it('例外を握り潰さず呼び出し元へ投げる', async () => {
    mockFetchEigaOscarAwards.mockRejectedValue(new Error('network down'));
    const { supabase } = createCapturingSupabase();

    await expect(syncSingleAward(supabase, params)).rejects.toThrow(
      'network down',
    );
  });
});
