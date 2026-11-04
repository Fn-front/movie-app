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
const mockExtractPersonNamesFromWikitext = jest.fn<Set<string>, [string]>();
jest.mock('@/lib/openai/generateAwardMovies', () => ({
  fetchAwardsFromOpenAI: (...args: unknown[]) =>
    mockFetchAwardsFromOpenAI(...args),
  resolveAwardsWithTMDb: (...args: unknown[]) =>
    mockResolveAwardsWithTMDb(...args),
  buildWikipediaTitle: (a: unknown, b: unknown) =>
    mockBuildWikipediaTitle(a, b),
  extractMovieTitlesFromWikitext: (text: string) =>
    mockExtractMovieTitlesFromWikitext(text),
  extractPersonNamesFromWikitext: (text: string) =>
    mockExtractPersonNamesFromWikitext(text),
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

/** 人名の検証テスト用（OpenAI フォールバック経路） */
const WIKITEXT_WITH_PERSON =
  "* '''[[ショーン・ペン]]''' - 『'''[[テスト映画]]'''』";

function createMockSupabase(
  upsertResult: { error: { message: string } | null } = { error: null },
  deleteResult: { error: unknown } = { error: null },
) {
  return {
    from: jest.fn(() => ({
      upsert: jest.fn(() => upsertResult),
      // UPSERT のあとに旧世代を消す。.eq().eq().in().lt() の順にチェーンする
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            in: jest.fn(() => ({
              lt: jest.fn().mockResolvedValue(deleteResult),
            })),
          })),
        })),
      })),
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
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: '== テスト記事 ==',
      sectionLookup: 'found',
    });
    // デフォルトですべてのタイトルを許可
    mockExtractMovieTitlesFromWikitext.mockReturnValue(
      new Set(['テスト映画', 'テスト']),
    );
    mockExtractPersonNamesFromWikitext.mockReturnValue(new Set());
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
      // 削除に失敗していなければ空
      expect(result.data.delete_failed_awards).toEqual([]);
    }
  });

  it('旧世代の削除に失敗した賞をサマリーに残す', async () => {
    // 無人の cron では console.error を誰も見ない。レスポンスに残さないと
    // 残留が1年（アカデミー賞は年1回）放置されても気づけない
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchEigaGoldenGlobes.mockResolvedValue(GOLDEN_GLOBES_ITEMS);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase(
      { error: null },
      { error: { message: 'canceling statement due to statement timeout' } },
    );
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      // データは新しいので synced のまま
      expect(result.data.synced_awards).toContain('golden_globes');
      // 要素が構造体になったので、賞名で引かないと何も検証しない
      expect(result.data.skipped_awards.map((a) => a.award_name)).not.toContain(
        'golden_globes',
      );
      expect(result.data.delete_failed_awards).toEqual(['golden_globes']);
    }
  });

  it('スキップした賞に理由を残す', async () => {
    // 賞名だけだと「なぜ入らなかったのか」が Vercel のログを見ないと分からない
    jest.setSystemTime(new Date('2026-05-15T00:00:00Z'));

    mockFetchWikipediaArticle.mockResolvedValue({ type: 'not_found' });

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.synced_awards).toEqual([]);
      expect(result.data.skipped_awards).toEqual([
        {
          award_name: 'cannes',
          reason: 'no_article',
          detail: '第26回テスト賞',
        },
      ]);
    }
  });

  it('例外で落ちた賞も理由付きで残す', async () => {
    jest.setSystemTime(new Date('2026-05-15T00:00:00Z'));

    // fetchWikipediaArticle は例外を内部で握るので reject しない。
    // 実際に投げうるのは TMDb 解決のほう
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: CANNES_WIKITEXT,
      sectionLookup: 'found',
    });
    mockResolveAwardsWithTMDb.mockRejectedValue(new Error('network down'));

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards).toEqual([
        {
          award_name: 'cannes',
          reason: 'error',
          detail: 'network down',
        },
      ]);
    }
  });

  it('書き込みに失敗した賞は理由とエラーメッセージを残す', async () => {
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchEigaGoldenGlobes.mockResolvedValue(GOLDEN_GLOBES_ITEMS);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase({ error: { message: 'upsert boom' } });
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards).toEqual([
        {
          award_name: 'golden_globes',
          reason: 'write_failed',
          detail: 'upsert boom',
        },
      ]);
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

    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: CANNES_WIKITEXT,
      sectionLookup: 'found',
    });
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
      expect(result.data.skipped_awards.map((s) => s.award_name)).toContain(
        'golden_globes',
      );
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
      expect(result.data.skipped_awards.map((s) => s.award_name)).toContain(
        'golden_globes',
      );
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
      expect(result.data.skipped_awards.map((s) => s.award_name)).toContain(
        'golden_globes',
      );
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
      expect(result.data.skipped_awards.map((s) => s.award_name)).toContain(
        'golden_globes',
      );
    }
  });

  it('処理中にエラーが発生しても他の賞の処理は続行する', async () => {
    // 1月に設定（ゴールデングローブ賞のみ）
    jest.setSystemTime(new Date('2026-01-15T00:00:00Z'));

    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: '== テスト記事 ==',
      sectionLookup: 'found',
    });
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト']));
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    mockResolveAwardsWithTMDb.mockResolvedValue([]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.skipped_awards.map((s) => s.award_name)).toContain(
        'golden_globes',
      );
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
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: '== テスト記事 ==',
      sectionLookup: 'found',
    });
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
    deleteResult: { error: unknown } = { error: null },
  ) {
    const upsert = jest.fn().mockResolvedValue(upsertResult);
    // DELETE は .eq().eq().in().lt() の順にチェーンする
    const lt = jest.fn().mockResolvedValue(deleteResult);
    const inCategories = jest.fn(() => ({ lt }));
    const eqYear = jest.fn(() => ({ in: inCategories }));
    const eqName = jest.fn(() => ({ eq: eqYear }));
    const del = jest.fn(() => ({ eq: eqName }));
    const supabase = {
      from: jest.fn(() => ({ upsert, delete: del })),
    } as unknown as Parameters<typeof syncSingleAward>[0];

    return { supabase, upsert, del, eqName, eqYear, inCategories, lt };
  }

  const params = {
    awardName: 'academy_awards' as const,
    awardDef: AWARD_DEFINITIONS.academy_awards,
    year: 2025,
    generatedAt: '2026-10-31T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: '== テスト記事 ==',
      sectionLookup: 'found',
    });
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));
    mockExtractPersonNamesFromWikitext.mockReturnValue(new Set());
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

  it('姓だけの人名は捨てる（部分一致を通さない）', async () => {
    // articleText.includes だと「ペン」が「ショーン・ペン」に部分一致して通る。
    // 監督賞の問い合わせに俳優名が混ざっても検知できなくなる
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: WIKITEXT_WITH_PERSON,
      sectionLookup: 'found',
    });
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));
    mockExtractPersonNamesFromWikitext.mockReturnValue(
      new Set(['ショーン・ペン']),
    );
    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
        person_name: 'ペン',
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);
    const { supabase } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    const items = mockResolveAwardsWithTMDb.mock.calls[0][0] as {
      person_name?: string;
    }[];
    expect(items.every((i) => i.person_name === undefined)).toBe(true);
  });

  it('半角中黒や余分な括弧があっても実在する人名は通す', async () => {
    // OpenAI の出力は非決定的で表記が揺れる。NFKC 正規化して突き合わせる
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: WIKITEXT_WITH_PERSON,
      sectionLookup: 'found',
    });
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));
    mockExtractPersonNamesFromWikitext.mockReturnValue(
      new Set(['ショーン・ペン']),
    );
    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
        // 半角中黒（U+FF65）
        person_name: 'ショーン･ペン',
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);
    const { supabase } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    const items = mockResolveAwardsWithTMDb.mock.calls[0][0] as {
      person_name?: string;
    }[];
    expect(items.every((i) => i.person_name === 'ショーン･ペン')).toBe(true);
  });

  it('wikitext に無い人名は捨てて作品だけ残す', async () => {
    // OpenAI 経路は捏造しうる。タイトルと同じく wikitext と突き合わせる
    // （eiga.com / wikitext パーサは正規表現なので捏造の余地が無い）
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: "* '''[[ショーン・ペン]]''' - 『'''[[テスト映画]]'''』",
      sectionLookup: 'found',
    });
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));
    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
        person_name: '実在しない人名',
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);
    const { supabase } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    // AWARD_DEFINITIONS の部門ぶんループするので件数は複数になる。
    // 見たいのは「作品は残り、人名だけ落ちる」こと
    const items = mockResolveAwardsWithTMDb.mock.calls[0][0] as {
      title_ja: string;
      person_name?: string;
    }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.title_ja === 'テスト映画')).toBe(true);
    expect(items.every((i) => i.person_name === undefined)).toBe(true);
  });

  it('wikitext にある人名はそのまま通す', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: WIKITEXT_WITH_PERSON,
      sectionLookup: 'found',
    });
    mockExtractMovieTitlesFromWikitext.mockReturnValue(new Set(['テスト映画']));
    mockExtractPersonNamesFromWikitext.mockReturnValue(
      new Set(['ショーン・ペン']),
    );
    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
        person_name: 'ショーン・ペン',
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);
    const { supabase } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    const items = mockResolveAwardsWithTMDb.mock.calls[0][0] as {
      person_name?: string;
    }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.person_name === 'ショーン・ペン')).toBe(true);
  });

  it('Wikipedia記事が存在しないとき no_article を記事名付きで返す', async () => {
    // 記事名の誤り。画面に記事名が出れば、それが実在するかその場で確かめられる
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({ type: 'not_found' });
    const { supabase, upsert } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({
      type: 'no_article',
      wikipediaTitle: '第26回テスト賞',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('Wikipediaの取得に失敗したとき article_unavailable を返す', async () => {
    // 一時的な障害。記事名の誤りとは対処が違う（再実行で直る）
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({ type: 'fetch_failed' });
    const { supabase, upsert } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({
      type: 'article_unavailable',
      wikipediaTitle: '第26回テスト賞',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('受賞セクションが無く抽出0件なら no_section を返す', async () => {
    // 記事はあるが構成が変わった可能性。記事が無いのとは別物
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: '== 概要 ==\n本文',
      sectionLookup: 'absent',
    });
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    const { supabase } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({
      type: 'no_section',
      wikipediaTitle: '第26回テスト賞',
    });
  });

  it('セクション一覧を読めなかったときは no_section を名乗らない', async () => {
    // 一覧APIが一時的に落ちただけ。「記事の構成が変わった」と出すと、
    // 実際には変わっていないパーサの調査へ admin を誘導してしまう
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: '== 概要 ==\n本文',
      sectionLookup: 'unknown',
    });
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    const { supabase } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'no_items' });
  });

  it('セクションはあるが抽出0件なら no_items を返す', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchWikipediaArticle.mockResolvedValue({
      type: 'ok',
      wikitext: '== 受賞とノミネート ==\n本文',
      sectionLookup: 'found',
    });
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    const { supabase } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'no_items' });
  });

  it('取得0件なら理由によらず DBに触らない', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([]);
    mockFetchAwardsFromOpenAI.mockResolvedValue(null);
    mockFetchWikipediaArticle.mockResolvedValue({ type: 'not_found' });
    const { supabase, upsert, del } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result.type).not.toBe('rows');
    expect(upsert).not.toHaveBeenCalled();
    // 「0件でUPSERT → 全部DELETE」になると全損する
    expect(del).not.toHaveBeenCalled();
  });

  it('UPSERT してから旧世代を削除する', async () => {
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
    const { supabase, upsert, del, eqName, eqYear, lt } =
      createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'synced', upsertedCount: 1 });
    // 逆順だと UPSERT 失敗時にその賞・年のデータが消えたまま復旧しない
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      del.mock.invocationCallOrder[0],
    );
    expect(eqName).toHaveBeenCalledWith('award_name', 'academy_awards');
    expect(eqYear).toHaveBeenCalledWith('award_year', 2025);
    expect(lt).toHaveBeenCalledWith('generated_at', '2026-10-31T00:00:00.000Z');
  });

  it('取得できなかった部門を削除対象に含めない', async () => {
    // eiga.com は取得に失敗したページを黙って飛ばす（continue）。全体が0件で
    // なければ早期 return に掛からないため、賞・年まるごと消すと
    // 未取得の部門が全滅する
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
      createResolvedMovie({ tmdb_movie_id: 1, category: 'best_picture' }),
      createResolvedMovie({ tmdb_movie_id: 2, category: 'best_picture' }),
      createResolvedMovie({ tmdb_movie_id: 3, category: 'best_director' }),
    ]);
    const { supabase, inCategories } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    expect(inCategories).toHaveBeenCalledTimes(1);
    const [column, categories] = inCategories.mock.calls[0] as unknown as [
      string,
      string[],
    ];
    expect(column).toBe('category');
    // best_actor など今回1件も取れなかった部門は対象外
    expect([...categories].sort()).toEqual(['best_director', 'best_picture']);
  });

  it('一部の作品がTMDb解決に失敗した部門は削除対象から外す', async () => {
    // 部門が丸ごと欠けるのではなく「10件あるはずが2件しか解決できなかった」
    // ケース。ここで消すと残り8件が恒久的に失われる（アカデミー賞の cron は
    // 年1回なので次の自動実行は1年後）
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    mockResolveAwardsWithTMDb.mockImplementation(
      (_items: unknown, _def: unknown, unresolved?: Set<string>) => {
        unresolved?.add('best_picture');
        return Promise.resolve([
          createResolvedMovie({ tmdb_movie_id: 1, category: 'best_picture' }),
          createResolvedMovie({ tmdb_movie_id: 3, category: 'best_director' }),
        ]);
      },
    );
    const { supabase, inCategories } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    const [, categories] = inCategories.mock.calls[0] as unknown as [
      string,
      string[],
    ];
    expect(categories).toEqual(['best_director']);
  });

  it('すべての部門で取りこぼしたら何も削除しない', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    mockResolveAwardsWithTMDb.mockImplementation(
      (_items: unknown, _def: unknown, unresolved?: Set<string>) => {
        unresolved?.add('best_picture');
        return Promise.resolve([
          createResolvedMovie({ tmdb_movie_id: 1, category: 'best_picture' }),
        ]);
      },
    );
    const { supabase, upsert, del } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    // UPSERT は走る（取れたぶんは最新化する）が、削除はしない
    expect(result).toEqual({ type: 'synced', upsertedCount: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
  });

  it('人名が変わった行は旧世代として消える', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    // 人名は一意キーに入っているため、表記が変われば別の行になる。
    // 旧行は UPSERT されず generated_at が古いまま残るので削除対象になる
    mockResolveAwardsWithTMDb.mockResolvedValue([
      createResolvedMovie({
        tmdb_movie_id: 1,
        category: 'best_picture',
        person_name: 'ゾーイ・サルダーニャ',
      }),
    ]);
    const { supabase, upsert, inCategories, lt } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    const rows = upsert.mock.calls[0][0] as { person_name: string }[];
    expect(rows[0].person_name).toBe('ゾーイ・サルダーニャ');
    // 同じ部門の「ゾーイ・サルダナ」の行は generated_at が古いまま残るため消える
    expect(inCategories).toHaveBeenCalledWith('category', ['best_picture']);
    expect(lt).toHaveBeenCalledWith('generated_at', params.generatedAt);
  });

  it('旧世代の削除に失敗しても synced を返す', async () => {
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
    // UPSERT は成功しているのでデータは新しい。残留が消えなかっただけ
    const { supabase } = createCapturingSupabase(
      { error: null },
      { error: { message: 'delete boom' } },
    );

    const result = await syncSingleAward(supabase, params);

    // 成功扱いは変えない。ただし残留が残ったことは結果に残す
    expect(result).toEqual({
      type: 'synced',
      upsertedCount: 1,
      deleteError: 'delete boom',
    });
  });

  it('削除に成功したら deleteError を含めない', async () => {
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
    const { supabase } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'synced', upsertedCount: 1 });
  });

  it('UPSERT に失敗したら削除へ進まない', async () => {
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
    const { supabase, del } = createCapturingSupabase({
      error: { message: 'boom' },
    });

    await syncSingleAward(supabase, params);

    expect(del).not.toHaveBeenCalled();
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
    const { supabase, upsert, del } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'no_tmdb_match' });
    expect(upsert).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
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

  it('同じ映画×同じ部門でも人名が異なれば両方 UPSERT する', async () => {
    mockFetchEigaOscarAwards.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test',
        category: 'best_picture',
        is_winner: true,
        year: 2024,
      },
    ]);
    // 演技賞では同じ作品から複数人がノミネートされる。受賞者が後ろにいると
    // 先勝ちで潰した場合に受賞が消える
    mockResolveAwardsWithTMDb.mockResolvedValue([
      createResolvedMovie({
        tmdb_movie_id: 1,
        is_winner: false,
        display_order: 1,
        person_name: 'セレーナ・ゴメス',
      }),
      createResolvedMovie({
        tmdb_movie_id: 1,
        is_winner: true,
        display_order: 2,
        person_name: 'ゾーイ・サルダナ',
      }),
    ]);
    const { supabase, upsert } = createCapturingSupabase();

    const result = await syncSingleAward(supabase, params);

    expect(result).toEqual({ type: 'synced', upsertedCount: 2 });
    expect(upsert.mock.calls[0][0]).toHaveLength(2);
  });

  it('UPSERT の競合キーに person_name を含める', async () => {
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
    const { supabase, upsert } = createCapturingSupabase();

    await syncSingleAward(supabase, params);

    expect(upsert.mock.calls[0][1]).toEqual({
      onConflict: 'tmdb_movie_id,award_name,award_year,category,person_name',
    });
  });

  it('例外を握り潰さず呼び出し元へ投げる', async () => {
    mockFetchEigaOscarAwards.mockRejectedValue(new Error('network down'));
    const { supabase } = createCapturingSupabase();

    await expect(syncSingleAward(supabase, params)).rejects.toThrow(
      'network down',
    );
  });
});
