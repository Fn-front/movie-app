/**
 * @jest-environment node
 */

/**
 * 利用者リストの取り直しのテスト（#433）
 *
 * 抽出クエリ（PostgREST の `.or()` と `nullsFirst`）が実際に意図どおり動くかは
 * ローカル Supabase で実測済み。ここは「どの経路でどの値を書くか」を固定する。
 */

const mockGetMovieListRefreshFields = jest.fn();

jest.mock('@/lib/tmdb/tmdb', () => ({
  getMovieListRefreshFields: (movieId: number) =>
    mockGetMovieListRefreshFields(movieId),
  // 純粋関数なので実装と同じ判定を置く
  isTmdbNotFoundError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as { response?: { status?: number } }).response?.status === 404,
}));

import { createClient } from '@supabase/supabase-js';

import { USER_LIST_REFRESH_LIMIT } from '@/constants/userListRefresh';

import { refreshUserListTmdbFields } from './refreshUserListTmdbFields';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

// ---------- ヘルパー ----------

/** TMDb から返る項目 */
const fields = (overrides: Record<string, unknown> = {}) => ({
  title: 'TMDbの邦題',
  posterPath: '/tmdb.jpg',
  releaseDate: '2026-05-01',
  genreIds: [28, 12],
  directorName: '監督',
  keywords: ['復讐'],
  releaseYear: 2026,
  ...overrides,
});

/** テーブルごとの抽出結果と movie_cache の内容からクライアントを組み立てる */
function createSupabaseMock(options: {
  rows?: Partial<Record<string, { id: string; tmdb_movie_id: number }[]>>;
  cache?: Record<string, unknown>[];
  selectError?: Partial<Record<string, string>>;
  updateError?: string | null;
}) {
  const {
    rows = {},
    cache = [],
    selectError = {},
    updateError = null,
  } = options;

  const updates: { table: string; payload: Record<string, unknown> }[] = [];

  const from = jest.fn((table: string) => ({
    select: () => {
      if (table === 'movie_cache') {
        const chain = {
          in: () => chain,
          eq: () => Promise.resolve({ data: cache, error: null }),
        };
        return chain;
      }
      const chain = {
        is: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () =>
          Promise.resolve(
            selectError[table]
              ? { data: null, error: { message: selectError[table] } }
              : { data: rows[table] ?? [], error: null },
          ),
      };
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return {
        eq: () =>
          Promise.resolve({
            error: updateError ? { message: updateError } : null,
          }),
      };
    },
  }));

  (createClient as jest.Mock).mockReturnValue({ from });

  return { from, updates };
}

/** 指定テーブルへの UPDATE ペイロードを返す */
const payloadsFor = (
  updates: { table: string; payload: Record<string, unknown> }[],
  table: string,
) => updates.filter((u) => u.table === table).map((u) => u.payload);

// ---------- テスト ----------

describe('refreshUserListTmdbFields', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    };
    mockGetMovieListRefreshFields.mockResolvedValue(fields());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('環境変数チェック', () => {
    it.each(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])(
      '%s が未設定ならエラーをスローする',
      async (key) => {
        delete process.env[key];

        await expect(refreshUserListTmdbFields()).rejects.toThrow(
          'Supabase環境変数が設定されていません',
        );
      },
    );
  });

  describe('解決元の振り分け', () => {
    it('movie_cache にあれば TMDb を呼ばない', async () => {
      createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
        cache: [
          {
            id: 1,
            title: 'キャッシュの邦題',
            poster_path: '/cache.jpg',
            release_date: '2026-01-01',
            genre_ids: [18],
          },
        ],
      });

      const result = await refreshUserListTmdbFields();

      expect(mockGetMovieListRefreshFields).not.toHaveBeenCalled();
      expect(result.fromCache).toBe(1);
      expect(result.fromTmdb).toBe(0);
    });

    // 本番実測で favorites の84% / watchlist の48% が movie_cache に無い。
    // 検索結果から直接登録できるため
    it('movie_cache に無ければ TMDb から取る', async () => {
      createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 99 }] },
        cache: [],
      });

      const result = await refreshUserListTmdbFields();

      expect(mockGetMovieListRefreshFields).toHaveBeenCalledWith(99);
      expect(result.fromTmdb).toBe(1);
    });

    // director_name / keywords は movie_cache に無いため、キャッシュを見ても
    // 結局 TMDb を引くことになる
    it('dismissed_movies は movie_cache にあっても TMDb から取る', async () => {
      createSupabaseMock({
        rows: { dismissed_movies: [{ id: 'd1', tmdb_movie_id: 1 }] },
        cache: [{ id: 1, title: 'キャッシュ', poster_path: null }],
      });

      await refreshUserListTmdbFields();

      expect(mockGetMovieListRefreshFields).toHaveBeenCalledWith(1);
    });

    it('テーブルを跨いで同じ作品でも TMDb は1回しか呼ばない', async () => {
      createSupabaseMock({
        rows: {
          favorites: [{ id: 'f1', tmdb_movie_id: 7 }],
          watchlist: [{ id: 'w1', tmdb_movie_id: 7 }],
        },
        cache: [],
      });

      await refreshUserListTmdbFields();

      expect(mockGetMovieListRefreshFields).toHaveBeenCalledTimes(1);
    });

    // リバイバル行の release_date は映画.com の再上映日。お気に入り一覧に
    // 「元の公開日」として出すと誤解を招くため、キャッシュから採らない
    it('リバイバル行はキャッシュの対象から外している', async () => {
      const { from } = createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
        cache: [],
      });

      await refreshUserListTmdbFields();

      expect(from).toHaveBeenCalledWith('movie_cache');
      // キャッシュが空（is_revival=false で絞った結果）なら TMDb へ回る
      expect(mockGetMovieListRefreshFields).toHaveBeenCalledWith(1);
    });
  });

  describe('書き戻す列', () => {
    it('favorites には release_date を書き、genre_ids は書かない', async () => {
      const { updates } = createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
      });

      await refreshUserListTmdbFields();

      const [payload] = payloadsFor(updates, 'favorites');
      expect(payload).toEqual({
        title: 'TMDbの邦題',
        poster_path: '/tmdb.jpg',
        release_date: '2026-05-01',
        tmdb_refreshed_at: expect.any(String),
      });
    });

    // ⚠️ 無い列を入れると PGRST204 で UPDATE が丸ごと落ちる
    it('dismissed_movies には推薦シグナルを書き、release_date は書かない', async () => {
      const { updates } = createSupabaseMock({
        rows: { dismissed_movies: [{ id: 'd1', tmdb_movie_id: 1 }] },
      });

      await refreshUserListTmdbFields();

      const [payload] = payloadsFor(updates, 'dismissed_movies');
      expect(payload).toEqual({
        title: 'TMDbの邦題',
        poster_path: '/tmdb.jpg',
        genre_ids: [28, 12],
        director_name: '監督',
        keywords: ['復讐'],
        release_year: 2026,
        tmdb_refreshed_at: expect.any(String),
      });
      expect(payload).not.toHaveProperty('release_date');
    });

    // title は NOT NULL 制約がある
    it.each([null, ''])(
      'TMDbの邦題が %p なら title を書かず既存値を残す',
      async (title) => {
        mockGetMovieListRefreshFields.mockResolvedValue(fields({ title }));
        const { updates } = createSupabaseMock({
          rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
        });

        await refreshUserListTmdbFields();

        expect(payloadsFor(updates, 'favorites')[0]).not.toHaveProperty(
          'title',
        );
      },
    );

    it('キーワードが空なら null を書く', async () => {
      mockGetMovieListRefreshFields.mockResolvedValue(fields({ keywords: [] }));
      const { updates } = createSupabaseMock({
        rows: { dismissed_movies: [{ id: 'd1', tmdb_movie_id: 1 }] },
      });

      await refreshUserListTmdbFields();

      expect(payloadsFor(updates, 'dismissed_movies')[0].keywords).toBeNull();
    });
  });

  describe('TMDbから消えた作品（案D）', () => {
    const gone = () => {
      mockGetMovieListRefreshFields.mockRejectedValue({
        response: { status: 404 },
      });
    };

    it('行を消さず tmdb_deleted_at を立てる', async () => {
      gone();
      const { updates } = createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
      });

      const result = await refreshUserListTmdbFields();

      const [payload] = payloadsFor(updates, 'favorites');
      expect(payload.tmdb_deleted_at).toEqual(expect.any(String));
      expect(
        result.tables.find((t) => t.name === 'favorites')?.markedDeleted,
      ).toBe(1);
    });

    // ⚠️ title を残すのは、これが無いと「どれが消えたか」を伝えられないため
    it('title は残し、他の TMDb 由来列は NULL にする', async () => {
      gone();
      const { updates } = createSupabaseMock({
        rows: {
          favorites: [{ id: 'f1', tmdb_movie_id: 1 }],
          dismissed_movies: [{ id: 'd1', tmdb_movie_id: 1 }],
        },
      });

      await refreshUserListTmdbFields();

      const fav = payloadsFor(updates, 'favorites')[0];
      expect(fav).not.toHaveProperty('title');
      expect(fav.poster_path).toBeNull();
      expect(fav.release_date).toBeNull();

      const dis = payloadsFor(updates, 'dismissed_movies')[0];
      expect(dis).not.toHaveProperty('title');
      expect(dis.genre_ids).toBeNull();
      expect(dis.director_name).toBeNull();
      expect(dis.keywords).toBeNull();
      expect(dis.release_year).toBeNull();
    });

    it('印を付ける書き込みに失敗したらerrorsに積む', async () => {
      gone();
      createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
        updateError: 'mark failed',
      });

      const result = await refreshUserListTmdbFields();

      expect(
        result.tables.find((t) => t.name === 'favorites')?.markedDeleted,
      ).toBe(0);
      expect(
        result.errors.some((e) => e.includes('favorites mark-deleted')),
      ).toBe(true);
    });

    // 404 は TMDb 側の確定的な応答。一時障害（429/503）とは扱いを変える
    it('404以外のエラーでは印を付けず、現状維持にする', async () => {
      mockGetMovieListRefreshFields.mockRejectedValue({
        response: { status: 503 },
      });
      const { updates } = createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
      });

      const result = await refreshUserListTmdbFields();

      expect(updates).toHaveLength(0);
      expect(result.items.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    // tmdb_refreshed_at を進めないので、次回また対象になる
    it('取得に失敗した行は tmdb_refreshed_at を進めない', async () => {
      mockGetMovieListRefreshFields.mockRejectedValue(new Error('timeout'));
      const { updates } = createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
      });

      await refreshUserListTmdbFields();

      expect(updates).toHaveLength(0);
    });
  });

  describe('失敗の扱い', () => {
    it('抽出に失敗したテーブルがあっても他は処理する', async () => {
      const { updates } = createSupabaseMock({
        rows: { watchlist: [{ id: 'w1', tmdb_movie_id: 1 }] },
        selectError: { favorites: 'boom' },
      });

      const result = await refreshUserListTmdbFields();

      expect(result.errors.some((e) => e.includes('favorites select'))).toBe(
        true,
      );
      expect(payloadsFor(updates, 'watchlist')).toHaveLength(1);
    });

    it('書き戻しに失敗したらerrorsに積み、件数を増やさない', async () => {
      createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
        updateError: 'update failed',
      });

      const result = await refreshUserListTmdbFields();

      expect(result.tables.find((t) => t.name === 'favorites')?.refreshed).toBe(
        0,
      );
      expect(result.errors.some((e) => e.includes('favorites update'))).toBe(
        true,
      );
    });

    it('非Errorがスローされても Unknown error として記録する', async () => {
      mockGetMovieListRefreshFields.mockRejectedValue('string error');
      createSupabaseMock({
        rows: { favorites: [{ id: 'f1', tmdb_movie_id: 1 }] },
      });

      const result = await refreshUserListTmdbFields();

      expect(result.errors.some((e) => e.includes('Unknown error'))).toBe(true);
    });
  });

  describe('上限', () => {
    // ⚠️ 黙って切り捨てると「全部取り直した」ように見え、違反が残る
    it('上限に達したらログに残し truncated を立てる', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      createSupabaseMock({
        rows: {
          favorites: Array.from(
            { length: USER_LIST_REFRESH_LIMIT },
            (_, i) => ({ id: `f${i}`, tmdb_movie_id: 1 }),
          ),
        },
      });

      const result = await refreshUserListTmdbFields();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(String(USER_LIST_REFRESH_LIMIT)),
      );
      expect(result.tables.find((t) => t.name === 'favorites')?.truncated).toBe(
        true,
      );
      warnSpy.mockRestore();
    });

    it('対象が無ければTMDbを呼ばない', async () => {
      createSupabaseMock({ rows: {} });

      const result = await refreshUserListTmdbFields();

      expect(mockGetMovieListRefreshFields).not.toHaveBeenCalled();
      expect(result.tmdbRequests).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });
});
