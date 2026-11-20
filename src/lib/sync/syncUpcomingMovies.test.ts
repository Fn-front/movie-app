/**
 * @jest-environment node
 */

/**
 * 公開予定の劇場公開作品 同期ロジックのテスト（#1000）
 *
 * ⚠️ ここのテストは**元 `/api/movies` の route.test.ts にあったもの**を
 * 移してきている。Discover ループがリクエスト処理から CRON へ移ったため、
 * ルート経由で間接的に見るのをやめて直接あてる。
 */

// モック定義（importより前に記述）
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/tmdb/tmdb', () => ({
  discoverMovies: jest.fn(),
}));

jest.mock('@/lib/movies/concertFilm', () => ({
  isConcertFilm: jest.fn().mockResolvedValue(false),
}));

import { createClient } from '@supabase/supabase-js';

import {
  DISCOVER_API_MAX_PAGES,
  MOVIES_FETCH_MONTHS_AHEAD,
  RELEASE_TYPE,
  RELEASE_TYPE_MAP,
} from '@/constants/movies';
import { isConcertFilm } from '@/lib/movies/concertFilm';
import { discoverMovies } from '@/lib/tmdb/tmdb';
import { formatDateToString } from '@/utils/date';
import type { Movie } from '@/lib/types';

import { syncUpcomingMovies } from './syncUpcomingMovies';

// ---------- ヘルパー ----------

/** テスト用の映画データを生成する */
function createMockMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 100,
    title: 'テスト映画',
    original_title: 'Test Movie',
    overview: 'テスト概要',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2099-05-01',
    vote_average: 7.0,
    popularity: 50,
    genre_ids: [28],
    adult: false,
    original_language: 'ja',
    vote_count: 500,
    ...overrides,
  };
}

/**
 * Discover の応答を組み立てる
 *
 * ⚠️ `raw_results_count` は**フィルタ前の件数**（#1166）。省略すると
 * 「ローカルのフィルタで全件落ちた」と「TMDb が本当に空」を取り違える。
 */
function discoverResponse(movies: Movie[], totalPages = 1) {
  return {
    results: movies,
    total_pages: totalPages,
    raw_results_count: movies.length,
  };
}

const rpcMock = jest.fn();
const fromMock = jest.fn();

function setupSupabase(options: { upsertError?: { message: string } } = {}) {
  rpcMock.mockResolvedValue({ error: options.upsertError ?? null });
  (createClient as jest.Mock).mockReturnValue({
    rpc: rpcMock,
    from: fromMock,
  });
}

/** UPSERT に渡された行をまとめて取り出す */
function upsertedRows(): Record<string, unknown>[] {
  return rpcMock.mock.calls.flatMap(
    (call) => (call[1] as { movies: Record<string, unknown>[] }).movies,
  );
}

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  (isConcertFilm as jest.Mock).mockResolvedValue(false);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  setupSupabase();
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.restoreAllMocks();
});

// ---------- テスト ----------

describe('syncUpcomingMovies', () => {
  describe('環境変数', () => {
    it.each(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])(
      '%s が未設定なら例外を投げる',
      async (key) => {
        delete process.env[key];

        await expect(syncUpcomingMovies()).rejects.toThrow(
          'Supabase環境変数が設定されていません',
        );
      },
    );
  });

  describe('Discover の呼び出し', () => {
    it('公開予定の劇場公開作品を取得してUPSERTする', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()]),
      );

      const result = await syncUpcomingMovies();

      expect(discoverMovies).toHaveBeenCalled();
      expect(result.upserted).toBe(1);
      // ⚠️ `fetched` は**フィルタ前**の件数（#1166）
      expect(result.fetched).toBe(1);
      expect(upsertedRows()[0]).toMatchObject({
        id: 100,
        title: 'テスト映画',
        release_type: RELEASE_TYPE.THEATRICAL,
      });
    });

    /**
     * ⚠️ 公開日の範囲は「今日から `MOVIES_FETCH_MONTHS_AHEAD` か月先」。
     * `gte` を過去に広げると公開中の作品まで混ざる。
     */
    it('今日以降の公開日で絞る', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(discoverResponse([]));

      await syncUpcomingMovies();

      const params = (discoverMovies as jest.Mock).mock.calls[0][0];
      const gte = new Date(params['release_date.gte']);
      const lte = new Date(params['release_date.lte']);

      // 月をまたぐ境界で日付がずれるため、月数の差で見る
      const monthsAhead =
        (lte.getFullYear() - gte.getFullYear()) * 12 +
        (lte.getMonth() - gte.getMonth());

      expect(monthsAhead).toBe(MOVIES_FETCH_MONTHS_AHEAD);
      expect(params.sort_by).toBe('popularity.desc');

      // ⚠️ 月数の差だけでは**窓ごと未来へずらす変異を見逃す**。
      //    起点が今日であることを別に固定する（レビューで実測）
      expect(params['release_date.gte']).toBe(formatDateToString(new Date()));
    });

    /**
     * ⚠️ **`with_release_type` がこの同期を「劇場公開作品の同期」に
     * している値**。配信（`4`）に変わると、公開予定タブに配信作品が
     * 劇場公開として入る。
     *
     * 兄弟の `syncNowShowingMovies` / `syncStreamingMovies` のテストも
     * ここをアサートしている。
     */
    it('劇場公開の release_type で問い合わせる', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(discoverResponse([]));

      await syncUpcomingMovies();

      expect(
        (discoverMovies as jest.Mock).mock.calls[0][0].with_release_type,
      ).toBe(RELEASE_TYPE_MAP[RELEASE_TYPE.THEATRICAL]);
    });

    /**
     * ⚠️ 判定は**フィルタ前の件数**で行う（#1166）。
     *
     * `discoverMovies` は `excludeInappropriateMovies` を通した配列を返すため、
     * `results.length === 0` は「ローカルのフィルタで全件落ちた」でも成立する。
     * そこで打ち切ると以降のページを取りにいかない。
     */
    it('TMDbが本当に空を返したらループを中断する', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue({
        results: [],
        total_pages: 5,
        raw_results_count: 0,
      });

      await syncUpcomingMovies();

      expect(discoverMovies).toHaveBeenCalledTimes(1);
    });

    it('ローカルのフィルタで全件落ちても次のページを取りにいく', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue({
        // フィルタ後は空だが、TMDb は返している
        results: [],
        total_pages: 5,
        raw_results_count: 20,
      });

      await syncUpcomingMovies();

      expect(discoverMovies).toHaveBeenCalledTimes(DISCOVER_API_MAX_PAGES);
    });

    it('最終ページに達したら打ち切る', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()], 2),
      );

      await syncUpcomingMovies();

      expect(discoverMovies).toHaveBeenCalledTimes(2);
    });

    it('ページ上限を超えて取りにいかない', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()], 999),
      );

      await syncUpcomingMovies();

      expect(discoverMovies).toHaveBeenCalledTimes(DISCOVER_API_MAX_PAGES);
    });
  });

  describe('保存する作品の絞り込み', () => {
    it('舞台中継は保存しない', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([
          createMockMovie({
            id: 1,
            title: 'ナショナル・シアター・ライブ こうもり',
          }),
          createMockMovie({ id: 2, title: '普通の映画' }),
        ]),
      );

      const result = await syncUpcomingMovies();

      expect(upsertedRows().map((row) => row.id)).toEqual([2]);
      expect(result.skipped).toBe(1);
    });

    it('ライブ興行作品は保存しない', async () => {
      (isConcertFilm as jest.Mock).mockImplementation(
        async (movie: Movie) => movie.id === 1,
      );
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([
          createMockMovie({ id: 1 }),
          createMockMovie({ id: 2 }),
        ]),
      );

      await syncUpcomingMovies();

      expect(upsertedRows().map((row) => row.id)).toEqual([2]);
    });

    /**
     * ⚠️ 除外数と採用数が同値になるケースだけだと、`skipped` の式を
     * 逆にしても通る。**非対称な件数**で固定する。
     */
    it('除外した件数を skipped に積む（採用数ではない）', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([
          createMockMovie({ id: 1, title: 'ナショナル・シアター・ライブ A' }),
          createMockMovie({ id: 2, title: 'ナショナル・シアター・ライブ B' }),
          createMockMovie({ id: 3, title: 'ナショナル・シアター・ライブ C' }),
          createMockMovie({ id: 4, title: '普通の映画' }),
        ]),
      );

      const result = await syncUpcomingMovies();

      expect(result.skipped).toBe(3);
      expect(result.upserted).toBe(1);
    });

    /**
     * ⚠️ `isQualityMovie` は adult・除外言語・低評価・低人気度をまとめて
     * 落とす。移設前は `/api/movies` の route.test.ts が見ていた観点。
     */
    it('低品質の作品は保存しない', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([
          createMockMovie({ id: 1, adult: true }),
          createMockMovie({ id: 2 }),
        ]),
      );

      await syncUpcomingMovies();

      expect(upsertedRows().map((row) => row.id)).toEqual([2]);
    });

    // 判定が誤ると音楽ドキュメンタリーまで落ちる
    it('ライブ興行でなければ保存する', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie({ id: 3 })]),
      );

      await syncUpcomingMovies();

      expect(upsertedRows().map((row) => row.id)).toEqual([3]);
    });
  });

  describe('UPSERT の内容', () => {
    /**
     * ⚠️ 素の `upsert` ではなく **RPC 経由**。リバイバル上映作品の
     * `release_date` は映画.com 側が持ち主で、TMDb の原公開日で上書きすると
     * 「リバイバル」バッジのまま公開日が数十年前になる。
     */
    it('upsert_movie_cache RPC 経由で保存する', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()]),
      );

      await syncUpcomingMovies();

      expect(rpcMock).toHaveBeenCalledWith(
        'upsert_movie_cache',
        expect.objectContaining({ movies: expect.any(Array) }),
      );
      // ⚠️ `set_now_playing` を渡さない。渡すと既存の is_now_playing が落ちる
      expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('set_now_playing');
    });

    it('表示に使う列を欠かさず渡す', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()]),
      );

      await syncUpcomingMovies();

      expect(Object.keys(upsertedRows()[0]).sort()).toEqual(
        [
          'backdrop_path',
          'cached_at',
          'genre_ids',
          'id',
          'original_language',
          'overview',
          'popularity',
          'poster_path',
          'release_date',
          'release_type',
          'title',
          'vote_average',
          'vote_count',
        ].sort(),
      );
    });

    it('vote_count を返さない作品は0で保存する', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([
          createMockMovie({ vote_count: undefined as unknown as number }),
        ]),
      );

      await syncUpcomingMovies();

      expect(upsertedRows()[0].vote_count).toBe(0);
    });

    it('空文字の release_date / overview は null にする', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie({ release_date: '', overview: '' })]),
      );

      await syncUpcomingMovies();

      expect(upsertedRows()[0].release_date).toBeNull();
      expect(upsertedRows()[0].overview).toBeNull();
    });

    /**
     * ⚠️ 別 `release_type` に存在するIDを除外しない。
     *
     * `movie_cache` の PK は `(id, release_type)` なので DB 側で共存できる。
     * 除外すると「劇場公開後に配信化された作品」が配信タブに一生出なくなる。
     * 加えて Supabase-js の暗黙1000行制限で除外自体が静かに壊れていた。
     */
    it('別release_typeの既存IDを問い合わせない', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()]),
      );

      await syncUpcomingMovies();

      expect(fromMock).not.toHaveBeenCalled();
    });
  });

  describe('失敗したとき', () => {
    /**
     * ⚠️ 1ページの失敗で全体を止めない。ただし**作品単位の失敗として
     * 数える**（#1354）。数えないと、全ページ失敗しても 200 で返る。
     */
    it('UPSERTが失敗しても続行し、失敗として数える', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()], 2),
      );
      setupSupabase({ upsertError: { message: 'boom' } });

      const result = await syncUpcomingMovies();

      expect(discoverMovies).toHaveBeenCalledTimes(2);
      expect(result.upserted).toBe(0);
      expect(result.errors).toHaveLength(2);
      expect(result.items).toEqual({ attempted: 2, failed: 2 });
    });

    it('成功したページは失敗に数えない', async () => {
      (discoverMovies as jest.Mock).mockResolvedValue(
        discoverResponse([createMockMovie()], 2),
      );
      rpcMock
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { message: 'boom' } });

      const result = await syncUpcomingMovies();

      expect(result.items).toEqual({ attempted: 2, failed: 1 });
    });

    // ⚠️ 取得段階の例外は握らない。CRON 側の catch で 500 + 通知に乗せる
    it('Discover の例外はそのまま投げる', async () => {
      (discoverMovies as jest.Mock).mockRejectedValue(new Error('TMDb 503'));

      await expect(syncUpcomingMovies()).rejects.toThrow('TMDb 503');
    });
  });
});
