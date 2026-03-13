/**
 * Now Playing 同期ロジックのテスト
 */

// モック定義（importより前に記述）
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/tmdb/tmdb', () => ({
  getNowPlayingMovies: jest.fn(),
  getMovieKeywordIds: jest.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import { EXCLUDED_GENRE_IDS, EXCLUDED_KEYWORD_IDS } from '@/constants/movies';
import { getNowPlayingMovies, getMovieKeywordIds } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';
import { syncNowPlayingMovies } from './syncNowPlayingMovies';
import type { NowPlayingSyncResult } from './syncNowPlayingMovies';

// ---------- ヘルパー ----------

/** テスト用の映画データを生成する */
function createMockMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    title: 'テスト映画',
    original_title: 'Test Movie',
    overview: '概要',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2026-01-01',
    vote_average: 7.0,
    popularity: 100,
    genre_ids: [28],
    adult: false,
    original_language: 'en',
    vote_count: 500,
    ...overrides,
  };
}

/**
 * Supabaseのfromモックを構築する
 * from() は複数回呼ばれるため、呼び出し順で挙動を制御する:
 * 1回目: select('id').neq(...) → 既存ストリーミングチェック
 * 2回目以降: upsert() → 映画データUPSERT
 * 最後: update(...).eq(...).eq(...).not(...).select('id') → クリア処理
 */
function createFromMock(options: {
  existingOtherTypeIds?: number[];
  upsertError?: { message: string } | null;
  clearData?: { id: number }[];
  clearError?: { message: string } | null;
}) {
  const {
    existingOtherTypeIds = [],
    upsertError = null,
    clearData = [],
    clearError = null,
  } = options;

  const fromMock = jest.fn();

  // 呼び出しごとの振り分け
  fromMock.mockImplementation(() => ({
    select: jest.fn().mockReturnValue({
      neq: jest.fn().mockResolvedValue({
        data: existingOtherTypeIds.map((id) => ({ id })),
      }),
    }),
    upsert: jest.fn().mockResolvedValue({ error: upsertError }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          not: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: clearData,
              error: clearError,
            }),
          }),
        }),
      }),
    }),
  }));

  return fromMock;
}

// ---------- 環境変数の保存・復元 ----------

const originalEnv = { ...process.env };

function setValidEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
}

// ---------- テスト ----------

describe('syncNowPlayingMovies', () => {
  // ---- 型テスト（既存） ----

  it('NowPlayingSyncResultの型が期待通りであること', () => {
    const result: NowPlayingSyncResult = {
      fetched: 40,
      upserted: 35,
      cleared: 3,
      skipped: 5,
      errors: [],
    };

    expect(result.fetched).toBe(40);
    expect(result.upserted).toBe(35);
    expect(result.cleared).toBe(3);
    expect(result.skipped).toBe(5);
    expect(result.errors).toHaveLength(0);
  });

  it('エラーがある場合のNowPlayingSyncResult', () => {
    const result: NowPlayingSyncResult = {
      fetched: 20,
      upserted: 0,
      cleared: 0,
      skipped: 2,
      errors: ['UPSERT error: connection failed'],
    };

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('UPSERT error');
  });

  // ---- 関数テスト ----

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('環境変数チェック', () => {
    it('NEXT_PUBLIC_SUPABASE_URL が未設定の場合エラーをスローする', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

      await expect(syncNowPlayingMovies()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });

    it('SUPABASE_SERVICE_ROLE_KEY が未設定の場合エラーをスローする', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(syncNowPlayingMovies()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });
  });

  describe('TMDb APIからの映画取得とフィルタリング', () => {
    it('adultフラグがtrueの映画をスキップする', async () => {
      setValidEnv();

      const adultMovie = createMockMovie({
        id: 1,
        adult: true,
        title: 'Adult Movie',
      });
      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [adultMovie],
      });

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.fetched).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });

    it('除外言語の映画をスキップする', async () => {
      setValidEnv();

      const excludedLangMovie = createMockMovie({
        id: 2,
        original_language: 'xx',
        title: '除外言語映画',
      });
      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [excludedLangMovie],
      });

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });

    it('除外ジャンルの映画をスキップする', async () => {
      setValidEnv();

      const excludedGenreMovie = createMockMovie({
        id: 3,
        genre_ids: [EXCLUDED_GENRE_IDS[0]],
        title: 'TV Movie',
      });
      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [excludedGenreMovie],
      });

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });

    it('genre_idsが空の映画をスキップする', async () => {
      setValidEnv();

      const noGenreMovie = createMockMovie({
        id: 4,
        genre_ids: [],
        title: 'No Genre Movie',
      });
      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [noGenreMovie],
      });

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });

    it('低品質コンテンツ（低評価・低人気度）をスキップする', async () => {
      setValidEnv();

      const lowQualityMovie = createMockMovie({
        id: 5,
        vote_average: 1.0,
        popularity: 0.1,
        title: 'Low Quality',
      });
      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [lowQualityMovie],
      });

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });
  });

  describe('別release_typeで既存の映画のスキップ', () => {
    it('別release_typeで既にDBに存在する映画をスキップする', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 100, title: '既存映画' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });

      const fromMock = createFromMock({ existingOtherTypeIds: [100] });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });
  });

  describe('除外キーワードチェック', () => {
    it('除外キーワードを含む映画をスキップする', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 200, title: 'キーワード除外映画' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (getMovieKeywordIds as jest.Mock).mockResolvedValueOnce([
        EXCLUDED_KEYWORD_IDS[0],
      ]);

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });
  });

  describe('UPSERT処理', () => {
    it('UPSERTが成功した場合upserted数がカウントされる', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 300, title: '成功映画' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (getMovieKeywordIds as jest.Mock).mockResolvedValueOnce([]);

      const upsertMock = jest.fn().mockResolvedValue({ error: null });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          neq: jest.fn().mockResolvedValue({ data: [] }),
        }),
        upsert: upsertMock,
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.upserted).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 300,
          title: '成功映画',
          release_type: 'theatrical',
          is_now_playing: true,
        }),
        { onConflict: 'id,release_type' },
      );
    });

    it('UPSERTがエラーの場合errorsに記録される', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 400, title: 'エラー映画' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (getMovieKeywordIds as jest.Mock).mockResolvedValueOnce([]);

      const fromMock = createFromMock({
        upsertError: { message: 'duplicate key violation' },
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.upserted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('エラー映画');
      expect(result.errors[0]).toContain('duplicate key violation');
    });
  });

  describe('is_now_playingクリア処理', () => {
    it('リストから外れた映画のis_now_playingをfalseにクリアする', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 500, title: 'クリア対象外映画' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (getMovieKeywordIds as jest.Mock).mockResolvedValueOnce([]);

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [{ id: 999 }, { id: 998 }],
                error: null,
              }),
            }),
          }),
        }),
      });

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          neq: jest.fn().mockResolvedValue({ data: [] }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.cleared).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(updateMock).toHaveBeenCalledWith({ is_now_playing: false });
    });

    it('クリア処理でエラーが発生した場合errorsに記録される', async () => {
      setValidEnv();

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      });

      const fromMock = createFromMock({
        clearError: { message: 'clear failed' },
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Clear error');
      expect(result.errors[0]).toContain('clear failed');
    });
  });

  describe('個別映画処理中のエラーハンドリング', () => {
    it('getMovieKeywordIdsが例外をスローした場合errorsに記録して処理を続行する', async () => {
      setValidEnv();

      const movie1 = createMockMovie({ id: 600, title: 'エラー映画1' });
      const movie2 = createMockMovie({ id: 601, title: '成功映画2' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [movie1, movie2],
      });
      (getMovieKeywordIds as jest.Mock)
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockResolvedValueOnce([]);

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('エラー映画1');
      expect(result.errors[0]).toContain('API rate limit exceeded');
      expect(result.upserted).toBe(1);
    });

    it('非Errorオブジェクトがスローされた場合Unknown errorとして記録する', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 700, title: '未知エラー映画' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (getMovieKeywordIds as jest.Mock).mockRejectedValueOnce('string error');

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('未知エラー映画');
      expect(result.errors[0]).toContain('Unknown error');
    });
  });

  describe('ページネーション', () => {
    it('複数ページの映画データを取得する', async () => {
      setValidEnv();

      const movie1 = createMockMovie({ id: 800, title: 'ページ1映画' });
      const movie2 = createMockMovie({ id: 801, title: 'ページ2映画' });

      (getNowPlayingMovies as jest.Mock)
        .mockResolvedValueOnce({
          page: 1,
          total_pages: 2,
          total_results: 2,
          results: [movie1],
        })
        .mockResolvedValueOnce({
          page: 2,
          total_pages: 2,
          total_results: 2,
          results: [movie2],
        });
      (getMovieKeywordIds as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.fetched).toBe(2);
      expect(result.upserted).toBe(2);
      expect(getNowPlayingMovies).toHaveBeenCalledTimes(2);
    });

    it('空のresultsが返された場合ページ取得を停止する', async () => {
      setValidEnv();

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 5,
        total_results: 0,
        results: [],
      });

      const fromMock = createFromMock({});
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await syncNowPlayingMovies();

      expect(result.fetched).toBe(0);
      expect(getNowPlayingMovies).toHaveBeenCalledTimes(1);
    });
  });
});
