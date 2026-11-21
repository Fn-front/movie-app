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
import type { MovieCacheStats } from '@/lib/types';
import {
  updateMoviesCacheByBatch,
  type BatchUpdateResult,
} from './updateMoviesCacheByBatch';

// ---------- ヘルパー ----------

/**
 * テスト用の同期指標データを生成する
 *
 * ⚠️ **`MovieCacheStats` の全フィールドを埋めること。** 欠けていると
 * `buildStatsRpcArgs` が `undefined` を作り、`JSON.stringify` がキーごと
 * 落として PGRST202（関数が見つからない）になる。本番では**その映画の
 * 全列が更新されない**のに、モックは引数を見ないので緑のまま通る。
 */
function createMockCacheStats(
  overrides: Partial<MovieCacheStats> = {},
): MovieCacheStats {
  return {
    genreIds: [],
    voteAverage: 8.0,
    voteCount: 0,
    popularity: 150.5,
    originalLanguage: null,
    title: 'タイトル',
    overview: 'あらすじ',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    releaseDate: '2026-01-01',
    ...overrides,
  };
}

/** RPC が受け取るべき引数名（11個） */
const RPC_ARG_NAMES = [
  'p_id',
  'p_title',
  'p_overview',
  'p_poster_path',
  'p_backdrop_path',
  'p_genre_ids',
  'p_release_date',
  'p_vote_average',
  'p_vote_count',
  'p_popularity',
  'p_original_language',
] as const;

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
  rpcError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const {
    selectData = [],
    selectError = null,
    rpcError = null,
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

  // ⚠️ 固定値を返さない。実装は RPC の戻り値（更新された行数）を
  //   `result.updated` に足すため、固定の 1 を返すと「同一IDが2行ある」
  //   ケースの集計が検証できない
  // `data` を `number | null` にしておく。件数が返らない場合の分岐を
  // 個別のテストから `mockResolvedValue({ data: null })` で差し替えるため
  const rpcMock = jest.fn(
    (
      _rpc: string,
      args: { p_id: number },
    ): Promise<{
      data: number | null;
      error: { message: string } | null;
    }> =>
      Promise.resolve({
        data: selectData.filter((row) => row.id === args.p_id).length,
        error: rpcError,
      }),
  );

  // ⚠️ **`update` を生やさない**（#433）。表示列の書き込みは
  //   `update_movie_cache_stats` RPC に集約した。素の `.update()` に戻すと
  //   リバイバル行の公開日を守る DB 側の CASE を迂回するため、ここに
  //   モックを置かないことで「戻したら落ちる」状態にしておく
  const fromMock = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      order: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({ range: rangeMock }),
      }),
    }),
    delete: deleteMock,
  });

  return Object.assign(fromMock, {
    rangeMock,
    rpcMock,
    deleteMock,
    deleteEqMock,
  });
}

/**
 * `createClient` が返すクライアントのモックを組み立てる
 *
 * 書き込みが `from().update()` から `rpc()` へ移ったため、クライアント直下に
 * `rpc` が要る（#433）。
 *
 * ⚠️ `rpcMock` を省略できるようにしているのは、映画ID取得で早期に抜ける
 * テスト（SELECT エラー / data が null）が `range` の挙動を個別に組むため。
 * それらは RPC へ到達しない。
 */
function createClientMock(fromMock: jest.Mock & { rpcMock?: jest.Mock }) {
  return { from: fromMock, rpc: fromMock.rpcMock };
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
      items: { attempted: 98, failed: 1 },
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
      (getMovieCacheStats as jest.Mock).mockRejectedValue({
        response: { status: 503 },
      });

      const result = await updateMoviesCacheByBatch();

      expect(fromMock.deleteMock).not.toHaveBeenCalled();
      expect(result.removedNotFound).toBe(0);
      expect(result.errors).toHaveLength(1);

      // ⚠️ 分母は `total`（`movie_cache` の行数）ではない（#1354）。
      //    ループが回るのは重複を除いた映画IDの数
      expect(result.items).toEqual({ attempted: 1, failed: 1 });
    });

    it('削除に失敗した場合はerrorsに積む', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 956160, release_type: 'theatrical' }],
        deleteError: { message: 'permission denied' },
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
      (getMovieCacheStats as jest.Mock).mockRejectedValue({
        response: { status: 404 },
      });

      const result = await updateMoviesCacheByBatch();

      expect(result.removedNotFound).toBe(0);
      expect(result.errors).toEqual(['ID 956160: permission denied']);
      // ⚠️ 記録点ごとに数える（#1354）。404 を受けての削除が失敗した経路
      expect(result.items).toEqual({ attempted: 1, failed: 1 });
    });

    it('同じIDが複数のrelease_typeにある場合はまとめて数える', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [
          { id: 956160, release_type: 'theatrical' },
          { id: 956160, release_type: 'streaming' },
        ],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
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
    it('RPC に original_language を含める', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 901, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats({ originalLanguage: 'ko' }),
      );

      await updateMoviesCacheByBatch();

      expect(fromMock.rpcMock).toHaveBeenCalledWith(
        'update_movie_cache_stats',
        expect.objectContaining({ p_original_language: 'ko' }),
      );
    });
  });

  // 表示列は行の作成時にしか書かれず、公開前に登録された作品は後から
  // ポスターや邦題が決まっても一覧に反映されなかった（#883）
  describe('表示列の追従', () => {
    /** 表示列を指定して1件更新し、RPC に渡された引数を返す */
    const updateOne = async (stats: Record<string, unknown>) => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 901, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats(stats),
      );

      await updateMoviesCacheByBatch();

      return fromMock.rpcMock.mock.calls[0][1];
    };

    it('後から付いたポスターを RPC に含める', async () => {
      const args = await updateOne({ posterPath: '/new-poster.jpg' });

      expect(args).toEqual(
        expect.objectContaining({ p_poster_path: '/new-poster.jpg' }),
      );
    });

    it('backdrop_path / title / overview も追従する', async () => {
      const args = await updateOne({
        backdropPath: '/new-backdrop.jpg',
        title: 'ハートランド',
        overview: '新しいあらすじ',
      });

      expect(args).toEqual(
        expect.objectContaining({
          p_backdrop_path: '/new-backdrop.jpg',
          p_title: 'ハートランド',
          p_overview: '新しいあらすじ',
        }),
      );
    });

    it('TMDbがポスターを持たない作品は null で上書きする', async () => {
      const args = await updateOne({ posterPath: null });

      expect(args).toEqual(expect.objectContaining({ p_poster_path: null }));
    });

    // title は NOT NULL 制約があり、空で上書きすると行が壊れる。
    // null を渡すと RPC 側の COALESCE(NULLIF(...), movie_cache.title) が既存値を残す
    it.each([null, ''])(
      'title が %p のときは RPC に null を渡して既存値を保たせる',
      async (title) => {
        const args = await updateOne({ title });

        expect(args).toEqual(expect.objectContaining({ p_title: null }));
      },
    );

    it('overview が空文字なら null に正規化する', async () => {
      const args = await updateOne({ overview: '' });

      expect(args).toEqual(expect.objectContaining({ p_overview: null }));
    });
  });

  // #433: /movie/{id} のレスポンスに含まれているのに書いていなかった2列。
  // ここが凍結していると TMDb 規約の「6ヶ月を超えて更新しない」に当たる
  describe('凍結していた列の追従', () => {
    const updateOne = async (stats: Record<string, unknown>) => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 901, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats(stats),
      );

      await updateMoviesCacheByBatch();

      return fromMock.rpcMock.mock.calls[0][1];
    };

    it('genre_ids を RPC に含める', async () => {
      const args = await updateOne({ genreIds: [28, 12] });

      expect(args).toEqual(expect.objectContaining({ p_genre_ids: [28, 12] }));
    });

    it('release_date を RPC に含める', async () => {
      const args = await updateOne({ releaseDate: '2026-03-01' });

      expect(args).toEqual(
        expect.objectContaining({ p_release_date: '2026-03-01' }),
      );
    });

    // TMDbは公開日未定の作品に空文字を返す。DATE 列に '' を渡すと
    // `invalid input syntax for type date` でその映画の UPDATE が丸ごと落ちる
    it('release_date が null のときはそのまま null を渡す', async () => {
      const args = await updateOne({ releaseDate: null });

      expect(args).toEqual(expect.objectContaining({ p_release_date: null }));
    });

    // ⛔ PostgREST は**引数名の集合で関数を解決する**。1つでも欠けると
    //   PGRST202 になり、その映画の全列が更新されない（ローカルで実測）。
    //   objectContaining の表明だけでは欠落を検出できないため、ここで集合を固定する
    it('RPC には11個の引数を必ず渡し、undefined を混ぜない', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 901, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats({}),
      );

      await updateMoviesCacheByBatch();

      const args = fromMock.rpcMock.mock.calls[0][1];
      expect(Object.keys(args).sort()).toEqual([...RPC_ARG_NAMES].sort());
      // ⚠️ toEqual は「値が undefined のキー」と「キーが無い」を同一視するので
      //    キー名の比較だけでは足りない
      expect(
        Object.entries(args).filter(([, value]) => value === undefined),
      ).toEqual([]);
    });

    // TMDb が項目を返さなかったときも undefined にしない
    it.each([
      ['voteAverage', 'p_vote_average', null],
      ['popularity', 'p_popularity', null],
      ['voteCount', 'p_vote_count', 0],
      ['originalLanguage', 'p_original_language', null],
    ])(
      '%s が欠けていても %s を null/既定値で送る',
      async (statsKey, argKey, expected) => {
        setValidEnv();

        const fromMock = createFromMock({
          selectData: [{ id: 901, release_type: 'theatrical' }],
        });
        (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
        const stats = createMockCacheStats({});
        delete (stats as unknown as Record<string, unknown>)[statsKey];
        (getMovieCacheStats as jest.Mock).mockResolvedValue(stats);

        await updateMoviesCacheByBatch();

        const args = fromMock.rpcMock.mock.calls[0][1] as Record<
          string,
          unknown
        >;
        expect(args[argKey]).toBe(expected);
      },
    );

    // ⚠️ リバイバル行の release_date を守る CASE は RPC の中にある。
    //   素の .update() に戻すとその保護を迂回するため、書き込みが
    //   必ず RPC を通ることをここで固定する
    //   （SQL 自体の挙動は jest では検証できない。PR で実DB検証の結果を添付）
    it('書き込みは update_movie_cache_stats RPC を通す', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 901, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
      (getMovieCacheStats as jest.Mock).mockResolvedValue(
        createMockCacheStats({}),
      );

      await updateMoviesCacheByBatch();

      expect(fromMock.rpcMock).toHaveBeenCalledWith(
        'update_movie_cache_stats',
        expect.objectContaining({ p_id: 901 }),
      );
    });
  });

  describe('映画ID取得', () => {
    it('DB取得エラーの場合エラーをスローする', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectError: { message: 'connection refused' },
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        '映画ID取得エラー: timeout',
      );
    });

    it('映画データが0件の場合、空の結果を返す', async () => {
      setValidEnv();

      const fromMock = createFromMock({ selectData: [] });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({}),
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
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({
          genreIds: [EXCLUDED_GENRE_IDS[0]],
        }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.removed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('delete failed');
      // ⚠️ 記録点ごとに数える（#1354）。除外ジャンルの削除が失敗した経路
      expect(result.items).toEqual({ attempted: 1, failed: 1 });
    });
  });

  describe('バッチ更新処理', () => {
    it('TMDb APIから最新情報を取得しDBを更新する', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [
          { id: 1, release_type: 'theatrical' },
          { id: 2, release_type: 'theatrical' },
        ],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock)
        .mockResolvedValueOnce(
          createMockCacheStats({ voteAverage: 8.5, popularity: 200 }),
        )
        .mockResolvedValueOnce(
          createMockCacheStats({ voteAverage: 7.0, popularity: 100 }),
        );

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(getMovieCacheStats).toHaveBeenCalledTimes(2);
      expect(fromMock.rpcMock).toHaveBeenCalledTimes(2);
      expect(fromMock.rpcMock).toHaveBeenCalledWith(
        'update_movie_cache_stats',
        expect.objectContaining({
          p_vote_average: 8.5,
          p_popularity: 200,
        }),
      );
    });

    it('同一IDで複数release_typeがある場合、ユニークIDで1回だけAPI呼び出しする', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [
          { id: 1, release_type: 'theatrical' },
          { id: 1, release_type: 'streaming' },
        ],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({ voteAverage: 9.0, popularity: 300 }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(getMovieCacheStats).toHaveBeenCalledTimes(1);
      // RPC も id 指定なので1回で両方の行が更新される
      expect(fromMock.rpcMock).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(2);
      expect(result.updated).toBe(2);
    });

    it('TMDb APIエラーの場合errorsに記録して処理を続行する', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [
          { id: 1, release_type: 'theatrical' },
          { id: 2, release_type: 'theatrical' },
        ],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock)
        .mockRejectedValueOnce(new Error('Request failed with status 404'))
        .mockResolvedValueOnce(
          createMockCacheStats({ voteAverage: 7.5, popularity: 120 }),
        );

      const result = await updateMoviesCacheByBatch();

      expect(result.updated).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('Request failed with status 404');
    });

    it('DB更新エラーの場合errorsに記録する', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 1, release_type: 'theatrical' }],
        rpcError: { message: 'update failed' },
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({}),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      // ⚠️ 記録点ごとに数える（#1354）。RPC が失敗した経路
      expect(result.items).toEqual({ attempted: 1, failed: 1 });
      expect(result.errors[0]).toContain('update failed');
    });

    // RPC は更新行数を返すが、PostgREST の応答が欠けた場合に備えて
    // `?? 0` で受けている。成功として数えつつ件数は増やさない
    it('RPC が件数を返さない場合は updated を増やさない', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 1, release_type: 'theatrical' }],
      });
      fromMock.rpcMock.mockResolvedValue({ data: null, error: null });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockResolvedValueOnce(
        createMockCacheStats({}),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.items).toEqual({ attempted: 1, failed: 0 });
    });

    it('非Errorオブジェクトがスローされた場合Unknown errorとして記録する', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectData: [{ id: 1, release_type: 'theatrical' }],
      });
      (createClient as jest.Mock).mockReturnValue(createClientMock(fromMock));

      (getMovieCacheStats as jest.Mock).mockRejectedValueOnce('string error');

      const result = await updateMoviesCacheByBatch();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('Unknown error');
    });
  });
});
