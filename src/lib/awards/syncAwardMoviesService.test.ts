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
const mockBuildWikipediaTitle = jest.fn(() => '第26回テスト賞');
jest.mock('@/lib/openai/generateAwardMovies', () => ({
  fetchAwardsFromOpenAI: (...args: unknown[]) =>
    mockFetchAwardsFromOpenAI(...args),
  resolveAwardsWithTMDb: (...args: unknown[]) =>
    mockResolveAwardsWithTMDb(...args),
  buildWikipediaTitle: (...args: unknown[]) =>
    mockBuildWikipediaTitle(...args),
}));

const mockFetchWikipediaArticle = jest.fn();
jest.mock('@/lib/wikipedia/fetchArticle', () => ({
  fetchWikipediaArticle: (...args: unknown[]) =>
    mockFetchWikipediaArticle(...args),
}));

import {
  getAwardsForMonth,
  executeSyncAwardMoviesCron,
} from './syncAwardMoviesService';

// --- Helper ---

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

  it('3月はアカデミー賞と日本アカデミー賞を返す', () => {
    const awards = getAwardsForMonth(3);
    expect(awards.length).toBe(2);
    const names = awards.map(([name]) => name);
    expect(names).toContain('academy_awards');
    expect(names).toContain('japan_academy_awards');
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

    // 各部門ごとにOpenAIが呼ばれる
    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト映画',
        title_en: 'Test Movie',
        category: 'best_drama',
        is_winner: true,
        year: 2025,
      },
    ]);
    mockResolveAwardsWithTMDb.mockResolvedValue([createResolvedMovie()]);

    const supabase = createMockSupabase();
    const result = await executeSyncAwardMoviesCron(supabase);

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.synced_awards).toContain('golden_globes');
      expect(result.data.total_upserted).toBeGreaterThan(0);
    }
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
    // 3月に設定（アカデミー賞 + 日本アカデミー賞）
    jest.setSystemTime(new Date('2026-03-15T00:00:00Z'));

    // 最初の賞（academy_awards）のWikipedia記事取得を失敗させる
    // 2番目の賞（japan_academy_awards）は正常に処理
    mockFetchWikipediaArticle
      .mockResolvedValueOnce(null) // academy_awards: Wikipedia取得失敗→skip
      .mockResolvedValueOnce('== テスト記事 =='); // japan_academy_awards: 正常

    mockFetchAwardsFromOpenAI.mockResolvedValue([
      {
        title_ja: 'テスト',
        title_en: 'Test',
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
      expect(result.data.skipped_awards.length).toBe(1);
      expect(result.data.synced_awards.length).toBe(1);
    }
  });
});
