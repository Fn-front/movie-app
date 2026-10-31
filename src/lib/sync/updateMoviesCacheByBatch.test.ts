/**
 * バッチ更新ロジックのテスト
 */

// モック定義（importより前に記述）
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/tmdb/tmdb', () => ({
  getMovieDetail: jest.fn(),
  getMovieCacheStats: jest.fn(),
  // 純粋関数なので実装と同じ判定を置く（本体のテストは tmdb.test.ts 側）
  isTmdbNotFoundError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as { response?: { status?: number } }).response?.status === 404,
}));

import { createClient } from '@supabase/supabase-js';

import { EXCLUDED_GENRE_IDS } from '@/constants';
import { getMovieCacheStats, getMovieDetail } from '@/lib/tmdb/tmdb';
import {
  updateMoviesCacheByBatch,
  type BatchUpdateResult,
} from './updateMoviesCacheByBatch';

// ---------- ヘルパー ----------

/** テスト用の同期指標データを生成する */
function createMockCacheStats(overrides: Record<string, unknown> = {}) {
  return {
    genreIds: [],
    voteAverage: 8.0,
    voteCount: 0,
    popularity: 150.5,
    originalLanguage: null,
    ...overrides,
  };
}

/** 映画ID取得のページサイズ（実装と同じ値） */
const SELECT_PAGE_SIZE = 1000;

/**
 * Supabaseのfromモックを構築する
 *
 * 映画ID取得は .order().order().range() のチェーンでページングするため、
 * range の指定に応じて該当ページを返す。
 */
function createFromMock(options: {
  selectData?: { id: number; release_type: string }[];
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const {
    selectData = [],
    selectError = null,
    updateError = null,
    deleteError = null,
  } = options;

  const rangeMock = jest.fn((from: number, to: number) =>
    Promise.resolve({
      data: selectError ? null : selectData.slice(from, to + 1),
      error: selectError,
    }),
  );

  const deleteEqMock = jest.fn().mockResolvedValue({ error: deleteError });
  const deleteMock = jest.fn().mockReturnValue({ eq: deleteEqMock });

  const updateMock = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({
      error: updateError,
    }),
  });

  const fromMock = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      order: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({ range: rangeMock }),
      }),
    }),
    update: updateMock,
    delete: deleteMock,
  });

  return Object.assign(fromMock, {
    rangeMock,
    updateMock,
    deleteMock,
    deleteEqMock,
  });
}

// ---------- 環境変数の保存・復元 ----------

const originalEnv = { ...process.env };

function setValidEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
}

// ---------- テスト ----------

describe('updateMoviesCacheByBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ---- 型テスト ----

  it('BatchUpdateResultの型が期待通りであること', () => {
    const result: BatchUpdateResult = {
      total: 100,
      updated: 95,
      removed: 2,
      removedNotFound: 1,
      errors: ['ID 1: error'],
    };

    expect(result.total).toBe(100);
    expect(result.updated).toBe(95);
    expect(result.removed).toBe(2);
    expect(result.removedNotFound).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  // ---- 環境変数チェック ----

  describe('環境変数チェック', () => {
    it('NEXT_PUBLIC_SUPABASE_URL が未設定の場合エラーをスローする', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });

    it('SUPABASE_SERVICE_ROLE_KEY が未設定の場合エラーをスローする', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });
  });

  // ---- 映画ID取得 ----

  describe('TMDbから消えた作品の削除', () => {
    it('TMDbが404を返す作品はmovie_cacheから削除する', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 956160, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockRejectedValue({
        response: { status: 404 },
      });

      const result = await updateMoviesCacheByBatch();

      expect(fromMock.deleteMock).toHaveBeenCalled();
      expect(fromMock.deleteEqMock).toHaveBeenCalledWith('id', 956160);
      expect(result.removedNotFound).toBe(1);
      // 毎日同じエラーを出し続けないよう、errors には積まない
      expect(result.errors).toHaveLength(0);
      expect(result.updated).toBe(0);
    });

    it('404以外のエラーでは削除せずerrorsに積む（一時障害で消さない）', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 500100, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockRejectedValue({
        response: { status: 503 },
      });

      const result = await updateMoviesCacheByBatch();

      expect(fromMock.deleteMock).not.toHaveBeenCalled();
      expect(result.removedNotFound).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('削除に失敗した場合はerrorsに積む', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 956160, release_type: 'theatrical' }],
        deleteError: { message: 'permission denied' },
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockRejectedValue({
        response: { status: 404 },
      });

      const result = await updateMoviesCacheByBatch();

      expect(result.removedNotFound).toBe(0);
      expect(result.errors).toEqual(['ID 956160: permission denied']);
    });

    it('同じIDが複数のrelease_typeにある場合はまとめて数える', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [
          { id: 956160, release_type: 'theatrical' },
          { id: 956160, release_type: 'streaming' },
        ],
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockRejectedValue({
        response: { status: 404 },
      });

      const result = await updateMoviesCacheByBatch();

      // delete は id 指定なので1回で両方消える
      expect(fromMock.deleteEqMock).toHaveBeenCalledTimes(1);
      expect(result.removedNotFound).toBe(2);
    });
  });

  describe('原語のバックフィル', () => {
    it('UPDATE に original_language を含める', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 901, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats({ originalLanguage: 'ko' }),
      );

      await updateMoviesCacheByBatch();

      expect(fromMock.updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ original_language: 'ko' }),
      );
    });
  });

  // 表示列は行の作成時にしか書かれず、公開前に登録された作品は後から
  // ポスターや邦題が決まっても一覧に反映されなかった（#883）
  describe('表示列の追従', () => {
    /** 表示列を指定して1件更新し、UPDATE に渡された値を返す */
    const updateOne = async (stats: Record<string, unknown>) => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 901, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats(stats),
      );

      await updateMoviesCacheByBatch();

      return fromMock.updateMock.mock.calls[0][0];
    };

    it('後から付いたポスターを UPDATE に含める', async () => {
      const payload = await updateOne({ posterPath: '/new-poster.jpg' });

      expect(payload).toEqual(
        expect.objectContaining({ poster_path: '/new-poster.jpg' }),
      );
    });

    it('backdrop_path / title / overview も追従する', async () => {
      const payload = await updateOne({
        backdropPath: '/new-backdrop.jpg',
        title: 'ハートランド',
        overview: '新しいあらすじ',
      });

      expect(payload).toEqual(
        expect.objectContaining({
          backdrop_path: '/new-backdrop.jpg',
          title: 'ハートランド',
          overview: '新しいあらすじ',
        }),
      );
    });

    it('TMDbがポスターを持たない作品は null で上書きする', async () => {
      const payload = await updateOne({ posterPath: null });

      expect(payload).toEqual(expect.objectContaining({ poster_path: null }));
    });

    // title は NOT NULL 制約があり、空で上書きすると行が壊れる
    it.each([null, ''])(
      'title が %p のときは既存値を保つため UPDATE に含めない',
      async (title) => {
        const payload = await updateOne({ title });

        expect(payload).not.toHaveProperty('title');
      },
    );

    it('overview が空文字なら null に正規化する', async () => {
      const payload = await updateOne({ overview: '' });

      expect(payload).toEqual(expect.objectContaining({ overview: null }));
    });

    // リバイバル上映は eiga 同期が release_date を意図的に上書きしている。
    // 毎日 TMDb の代表公開日で塗り潰すとその補正が消える
    it('release_date は UPDATE に含めない', async () => {
      const payload = await updateOne({ posterPath: '/p.jpg' });

      expect(payload).not.toHaveProperty('release_date');
    });
  });

  describe('映画ID取得', () => {
    it('DB取得エラーの場合エラーをスローする', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectError: { message: 'connection refused' },
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        '映画ID取得エラー: connection refused',
      );
    });

    it('1000件を超える場合もページングして全件取得する', async () => {
      setValidEnv();

      // 1000行の上限をまたぐ件数（1000件目以降が欠落していないことを確認）
      const rows = Array.from({ length: SELECT_PAGE_SIZE + 250 }, (_, i) => ({
        id: i + 1,
        release_type: 'theatrical',
      }));

      const fromMock = createFromMock({ selectData: rows });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats(),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(SELECT_PAGE_SIZE + 250);
      expect(result.updated).toBe(SELECT_PAGE_SIZE + 250);
      // 2ページ目を取得し、3ページ目（空）で打ち切る
      expect(fromMock.rangeMock).toHaveBeenCalledTimes(2);
      expect(fromMock.rangeMock).toHaveBeenNthCalledWith(
        1,
        0,
        SELECT_PAGE_SIZE - 1,
      );
      expect(fromMock.rangeMock).toHaveBeenNthCalledWith(
        2,
        SELECT_PAGE_SIZE,
        SELECT_PAGE_SIZE * 2 - 1,
      );
    });

    it('予告動画を含まない軽量な取得関数を使う', async () => {
      // 全件を毎日なめる経路なので、使わないクレジット・配信情報・予告動画を
      // レスポンスに含めない（include_video_language で動画が100件超になる）
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 1, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats(),
      );

      await updateMoviesCacheByBatch();

      expect(getMovieCacheStats).toHaveBeenCalledWith(1);
      expect(getMovieDetail).not.toHaveBeenCalled();
    });

    it('ちょうど1000件の場合、次ページを取得して空で打ち切る', async () => {
      setValidEnv();

      const rows = Array.from({ length: SELECT_PAGE_SIZE }, (_, i) => ({
        id: i + 1,
        release_type: 'theatrical',
      }));

      const fromMock = createFromMock({ selectData: rows });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats(),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(SELECT_PAGE_SIZE);
      expect(fromMock.rangeMock).toHaveBeenCalledTimes(2);
    });

    it('2ページ目の取得エラーでもエラーをスローする', async () => {
      setValidEnv();

      const rows = Array.from({ length: SELECT_PAGE_SIZE }, (_, i) => ({
        id: i + 1,
        release_type: 'theatrical',
      }));

      let call = 0;
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn(() => {
                call++;
                return call === 1
                  ? Promise.resolve({ data: rows, error: null })
                  : Promise.resolve({
                      data: null,
                      error: { message: 'timeout' },
                    });
              }),
            }),
          }),
        }),
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        '映画ID取得エラー: timeout',
      );
    });

    it('映画データが0件の場合、空の結果を返す', async () => {
      setValidEnv();

      const fromMock = createFromMock({ selectData: [] });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('dataがnullの場合、空の結果を返す', async () => {
      setValidEnv();

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(0);
      expect(result.updated).toBe(0);
    });
  });

  // ---- バッチ更新処理 ----

  describe('除外ジャンルの再判定', () => {
    it('TMDbで後から除外ジャンルが付いた作品を削除すること', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];
      const fromMock = createFromMock({ selectData: rows });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
          id: 1,
          genreIds: [35, EXCLUDED_GENRE_IDS[0]],
        }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(fromMock.deleteMock).toHaveBeenCalled();
      expect(fromMock.deleteEqMock).toHaveBeenCalledWith('id', 1);
      expect(result.removed).toBe(1);
      expect(result.updated).toBe(0);
    });

    it('同一IDが複数 release_type にある場合はまとめて削除し行数を数えること', async () => {
      setValidEnv();

      const rows = [
        { id: 1, release_type: 'theatrical' },
        { id: 1, release_type: 'streaming' },
      ];
      const fromMock = createFromMock({ selectData: rows });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
          id: 1,
          genreIds: [EXCLUDED_GENRE_IDS[0]],
        }),
      );

      const result = await updateMoviesCacheByBatch();

      // delete は id 指定なので1回で両行が消える
      expect(fromMock.deleteMock).toHaveBeenCalledTimes(1);
      expect(result.removed).toBe(2);
    });

    it('除外ジャンルを含まない作品は削除せず更新すること', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];
      const fromMock = createFromMock({ selectData: rows });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
          id: 1,
          genreIds: [18],
        }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(fromMock.deleteMock).not.toHaveBeenCalled();
      expect(result.removed).toBe(0);
      expect(result.updated).toBe(1);
    });

    it('genres が未設定の場合は削除しないこと', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];
      const fromMock = createFromMock({ selectData: rows });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({ id: 1 }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(fromMock.deleteMock).not.toHaveBeenCalled();
      expect(result.updated).toBe(1);
    });

    it('削除に失敗した場合はエラーに記録し removed を増やさないこと', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];
      const fromMock = createFromMock({
        selectData: rows,
        deleteError: { message: 'delete failed' },
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
          id: 1,
          genreIds: [EXCLUDED_GENRE_IDS[0]],
        }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.removed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('delete failed');
    });
  });

  describe('バッチ更新処理', () => {
    it('TMDb APIから最新情報を取得しDBを更新する', async () => {
      setValidEnv();

      const rows = [
        { id: 1, release_type: 'theatrical' },
        { id: 2, release_type: 'theatrical' },
      ];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn((from: number, to: number) =>
                Promise.resolve({
                  data: rows.slice(from, to + 1),
                  error: null,
                }),
              ),
            }),
          }),
        }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock)
        .mockResolvedValueOnce(
          createMockCacheStats({ id: 1, voteAverage: 8.5, popularity: 200 }),
        )
        .mockResolvedValueOnce(
          createMockCacheStats({ id: 2, voteAverage: 7.0, popularity: 100 }),
        );

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(getMovieCacheStats).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          vote_average: 8.5,
          popularity: 200,
        }),
      );
    });

    it('同一IDで複数release_typeがある場合、ユニークIDで1回だけAPI呼び出しする', async () => {
      setValidEnv();

      const rows = [
        { id: 1, release_type: 'theatrical' },
        { id: 1, release_type: 'streaming' },
      ];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn((from: number, to: number) =>
                Promise.resolve({
                  data: rows.slice(from, to + 1),
                  error: null,
                }),
              ),
            }),
          }),
        }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({ id: 1, voteAverage: 9.0, popularity: 300 }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(getMovieCacheStats).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(2);
      expect(result.updated).toBe(2);
    });

    it('TMDb APIエラーの場合errorsに記録して処理を続行する', async () => {
      setValidEnv();

      const rows = [
        { id: 1, release_type: 'theatrical' },
        { id: 2, release_type: 'theatrical' },
      ];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn((from: number, to: number) =>
                Promise.resolve({
                  data: rows.slice(from, to + 1),
                  error: null,
                }),
              ),
            }),
          }),
        }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock)
        .mockRejectedValueOnce(new Error('Request failed with status 404'))
        .mockResolvedValueOnce(
          createMockCacheStats({ id: 2, voteAverage: 7.5, popularity: 120 }),
        );

      const result = await updateMoviesCacheByBatch();

      expect(result.updated).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('Request failed with status 404');
    });

    it('DB更新エラーの場合errorsに記録する', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest
          .fn()
          .mockResolvedValue({ error: { message: 'update failed' } }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn((from: number, to: number) =>
                Promise.resolve({
                  data: rows.slice(from, to + 1),
                  error: null,
                }),
              ),
            }),
          }),
        }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({ id: 1 }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('update failed');
    });

    it('非Errorオブジェクトがスローされた場合Unknown errorとして記録する', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn((from: number, to: number) =>
                Promise.resolve({
                  data: rows.slice(from, to + 1),
                  error: null,
                }),
              ),
            }),
          }),
        }),
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieCacheStats as jest.Mock).mockRejectedValueOnce('string error');

      const result = await updateMoviesCacheByBatch();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('Unknown error');
    });
  });
});
