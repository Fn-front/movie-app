/**
 * Now Playing 同期ロジックのテスト
 */

// モック定義（importより前に記述）
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/tmdb/tmdb', () => ({
  getNowPlayingMovies: jest.fn(),
  hasExcludedKeyword: jest.fn(),
  getMovieKeywordIds: jest.fn().mockResolvedValue([]),
}));

import { createClient } from '@supabase/supabase-js';
import {
  CONCERT_KEYWORD_IDS,
  DOCUMENTARY_GENRE_ID,
  EXCLUDED_GENRE_IDS,
  MUSIC_GENRE_ID,
} from '@/constants/movies';
import {
  getMovieKeywordIds,
  getNowPlayingMovies,
  hasExcludedKeyword,
} from '@/lib/tmdb/tmdb';
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
 * Supabaseクライアントのモックを構築する
 *
 * 映画データのUPSERTは upsert_movie_cache RPC 経由（リバイバル行の
 * release_date を上書きしないため）。from() は is_now_playing のクリアに使う。
 */
function createSupabaseMock(options: {
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

  const rpcMock = jest.fn().mockResolvedValue({ error: upsertError });
  const fromMock = jest.fn();

  // 呼び出しごとの振り分け
  fromMock.mockImplementation(() => ({
    select: jest.fn().mockReturnValue({
      neq: jest.fn().mockResolvedValue({
        data: existingOtherTypeIds.map((id) => ({ id })),
      }),
    }),
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

  return { from: fromMock, rpc: rpcMock, fromMock, rpcMock };
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

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });
  });

  describe('別release_typeとの共存（相互排他の撤廃）', () => {
    it('streaming として既にDBに存在する映画でも除外せずUPSERTする', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 100, title: '配信済みの劇場公開作' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      // 別release_type に同じIDが存在する状況
      const supabaseMock = createSupabaseMock({ existingOtherTypeIds: [100] });
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      // PK は (id, release_type) のため共存でき、スキップしてはいけない
      expect(result.skipped).toBe(0);
      expect(result.upserted).toBe(1);
    });

    it('別release_typeの既存ID取得クエリ（1000行制限の原因）を発行しない', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 101 });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      await syncNowPlayingMovies();

      // 事前SELECTは廃止済み。UPSERTはRPC経由なので from() は
      // is_now_playing クリアの1回のみ
      expect(supabaseMock.fromMock).toHaveBeenCalledTimes(1);
      expect(supabaseMock.rpcMock).toHaveBeenCalledTimes(1);
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
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(true);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });
  });

  describe('ライブ興行作品の除外', () => {
    it('タイトルでライブ興行と判定できる作品をスキップする', async () => {
      setValidEnv();

      const movie = createMockMovie({
        id: 300,
        genre_ids: [MUSIC_GENRE_ID],
        title: 'ヨルシカ LIVE「盗作」',
      });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
      // タイトルで判定できるためキーワードは問い合わせない
      expect(getMovieKeywordIds).not.toHaveBeenCalled();
    });

    it('concert系キーワードを持つ作品をスキップする', async () => {
      setValidEnv();

      const movie = createMockMovie({
        id: 301,
        genre_ids: [MUSIC_GENRE_ID, DOCUMENTARY_GENRE_ID],
        title: 'Queen Budapest',
      });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);
      (getMovieKeywordIds as jest.Mock).mockResolvedValueOnce([
        CONCERT_KEYWORD_IDS[0],
      ]);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(1);
      expect(result.upserted).toBe(0);
    });

    it('同じジャンル構成でも音楽ドキュメンタリーは保存する', async () => {
      setValidEnv();

      const movie = createMockMovie({
        id: 302,
        genre_ids: [MUSIC_GENRE_ID, DOCUMENTARY_GENRE_ID],
        title: 'オアシス：ドント・ルック・バック・イン・アンガー',
      });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);
      (getMovieKeywordIds as jest.Mock).mockResolvedValueOnce([165194]);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.skipped).toBe(0);
      expect(result.upserted).toBe(1);
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
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.upserted).toBe(1);
      expect(result.errors).toHaveLength(0);
      // リバイバル行の release_date を保護するため RPC 経由で UPSERT する
      expect(supabaseMock.rpcMock).toHaveBeenCalledWith('upsert_movie_cache', {
        movies: [
          expect.objectContaining({
            id: 300,
            title: '成功映画',
            release_type: 'theatrical',
          }),
        ],
        set_now_playing: true,
      });
      // is_now_playing は payload ではなく set_now_playing 引数で立てる
      expect(
        supabaseMock.rpcMock.mock.calls[0][1].movies[0],
      ).not.toHaveProperty('is_now_playing');
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
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({
        upsertError: { message: 'duplicate key violation' },
      });
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

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

      const supabaseMock = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            neq: jest.fn().mockResolvedValue({ data: [] }),
          }),
          update: updateMock,
        }),
        rpc: jest.fn().mockResolvedValue({ error: null }),
      };
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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

      const supabaseMock = createSupabaseMock({
        clearError: { message: 'clear failed' },
      });
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Clear error');
      expect(result.errors[0]).toContain('clear failed');
    });
  });

  describe('個別映画処理中のエラーハンドリング', () => {
    it('キーワード判定が例外をスローした場合errorsに記録して処理を続行する', async () => {
      setValidEnv();

      const movie1 = createMockMovie({ id: 600, title: 'エラー映画1' });
      const movie2 = createMockMovie({ id: 601, title: '成功映画2' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [movie1, movie2],
      });
      (hasExcludedKeyword as jest.Mock)
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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
      (hasExcludedKeyword as jest.Mock).mockRejectedValueOnce('string error');

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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
      (hasExcludedKeyword as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

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

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.fetched).toBe(0);
      expect(getNowPlayingMovies).toHaveBeenCalledTimes(1);
    });
  });

  describe('リバイバル作品の公開日保護', () => {
    it('release_dateの上書き判定をDB側に委ねるRPCを使う', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 700, release_date: '1979-10-06' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      await syncNowPlayingMovies();

      // 素の upsert ではリバイバル行の release_date を保護できないため
      // RPC 経由であることを固定する
      expect(supabaseMock.rpcMock).toHaveBeenCalledWith(
        'upsert_movie_cache',
        expect.objectContaining({ set_now_playing: true }),
      );
      // movie_cache への直接 upsert は行わない
      for (const result of supabaseMock.fromMock.mock.results) {
        expect(result.value.upsert).toBeUndefined();
      }
    });

    it('TMDbのrelease_dateはそのままRPCに渡す（保護判定はDB側）', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 701, release_date: '1996-02-17' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      await syncNowPlayingMovies();

      expect(supabaseMock.rpcMock.mock.calls[0][1].movies[0].release_date).toBe(
        '1996-02-17',
      );
    });

    it('RPCが失敗した場合errorsに記録される', async () => {
      setValidEnv();

      const movie = createMockMovie({ id: 702, title: 'RPC失敗映画' });

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({
        upsertError: { message: 'rpc failed' },
      });
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      const result = await syncNowPlayingMovies();

      expect(result.upserted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('RPC失敗映画');
      expect(result.errors[0]).toContain('rpc failed');
    });
  });

  describe('vote_count の保存', () => {
    /** 1件だけ同期させ、UPSERTに渡された行を取り出す */
    async function upsertRowOf(movie: Movie) {
      setValidEnv();

      (getNowPlayingMovies as jest.Mock).mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie],
      });
      (hasExcludedKeyword as jest.Mock).mockResolvedValueOnce(false);

      const supabaseMock = createSupabaseMock({});
      (createClient as jest.Mock).mockReturnValue(supabaseMock);

      await syncNowPlayingMovies();

      // UPSERTはRPC経由。movies 配列の先頭が対象の行
      return supabaseMock.rpcMock.mock.calls[0][1].movies[0];
    }

    it('TMDbのvote_countをmovie_cacheにUPSERTする', async () => {
      const row = await upsertRowOf(createMockMovie({ vote_count: 1234 }));

      expect(row.vote_count).toBe(1234);
    });

    it('vote_countが欠落している場合は0として保存する', async () => {
      const movie = createMockMovie();
      // TMDbレスポンスに vote_count が含まれないケース
      delete (movie as Partial<Movie>).vote_count;

      const row = await upsertRowOf(movie as Movie);

      expect(row.vote_count).toBe(0);
    });
  });
});
