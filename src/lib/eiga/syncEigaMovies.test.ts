/**
 * TMDb照合・DB補完ロジックのテスト
 */

// TMDbモジュールのモック（モジュールレベルの環境変数チェックを回避）
jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: jest.fn(),
  getMovieKeywordIds: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('./eiga', () => ({
  fetchEigaMovies: jest.fn(),
  fetchOriginalTitle: jest.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import { searchMovies, getMovieKeywordIds } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

import {
  findBestMatch,
  isRevival,
  syncEigaMovies,
  type SyncResult,
} from './syncEigaMovies';
import { fetchEigaMovies, fetchOriginalTitle } from './eiga';
import type { EigaMovie } from './eiga';

/**
 * テスト用の映画データを生成する
 */
function createMockMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    title: 'テスト映画',
    original_title: 'Test Movie',
    overview: 'テスト概要',
    poster_path: '/test.jpg',
    backdrop_path: '/test-bg.jpg',
    release_date: '2026-03-01',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 50.0,
    genre_ids: [28],
    adult: false,
    original_language: 'ja',
    ...overrides,
  };
}

describe('findBestMatch', () => {
  const eigaMovie: EigaMovie = {
    title: 'テスト映画',
    releaseDate: '2026-03-01',
    eigaUrl: null,
  };

  it('タイトル完全一致の映画を優先する', () => {
    const candidates = [
      createMockMovie({ id: 1, title: '別の映画', popularity: 100 }),
      createMockMovie({ id: 2, title: 'テスト映画', popularity: 10 }),
    ];

    const result = findBestMatch(candidates, eigaMovie);

    expect(result?.id).toBe(2);
  });

  it('公開日が近い映画を優先する', () => {
    const candidates = [
      createMockMovie({
        id: 1,
        title: 'テスト映画',
        release_date: '2026-06-01',
      }),
      createMockMovie({
        id: 2,
        title: 'テスト映画',
        release_date: '2026-03-05',
      }),
    ];

    const result = findBestMatch(candidates, eigaMovie);

    expect(result?.id).toBe(2);
  });

  it('adultコンテンツを除外する', () => {
    const candidates = [
      createMockMovie({ id: 1, title: 'テスト映画', adult: true }),
      createMockMovie({
        id: 2,
        title: '別の映画',
        release_date: '2026-03-01',
      }),
    ];

    const result = findBestMatch(candidates, eigaMovie);

    expect(result?.id).toBe(2);
  });

  it('除外言語の映画を除外する', () => {
    const candidates = [
      createMockMovie({
        id: 1,
        title: 'テスト映画',
        original_language: 'ko',
      }),
      createMockMovie({
        id: 2,
        title: 'テスト映画',
        original_language: 'zh',
      }),
      createMockMovie({
        id: 3,
        title: '別の映画',
        original_language: 'en',
        release_date: '2026-03-01',
      }),
    ];

    const result = findBestMatch(candidates, eigaMovie);

    expect(result?.id).toBe(3);
  });

  it('候補が空配列の場合はnullを返す', () => {
    const result = findBestMatch([], eigaMovie);

    expect(result).toBeNull();
  });

  it('フィルタ後に候補が0件の場合はnullを返す', () => {
    const candidates = [
      createMockMovie({ id: 1, title: 'テスト映画', adult: true }),
    ];

    const result = findBestMatch(candidates, eigaMovie);

    expect(result).toBeNull();
  });

  it('タイトル不一致で公開日も遠い場合はnullを返す', () => {
    const candidates = [
      createMockMovie({
        id: 1,
        title: '全く違う映画',
        release_date: '2027-12-01',
        popularity: 1,
      }),
    ];

    const result = findBestMatch(candidates, eigaMovie);

    expect(result).toBeNull();
  });

  it('originalTitleが一致する場合はスコアボーナスが付与される', () => {
    const candidates = [
      createMockMovie({
        id: 1,
        title: 'Mon Inséparable',
        original_title: 'Mon inséparable',
        release_date: '2024-12-25',
        popularity: 10,
      }),
    ];

    // originalTitle指定なしだとスコア不足でnull
    const withoutOriginal = findBestMatch(candidates, {
      title: '私のすべて',
      releaseDate: '2026-02-13',
      eigaUrl: null,
    });
    expect(withoutOriginal).toBeNull();

    // originalTitle指定ありだと原題一致ボーナスでマッチ
    const withOriginal = findBestMatch(
      candidates,
      { title: '私のすべて', releaseDate: '2026-02-13', eigaUrl: null },
      'Mon inséparable',
    );
    expect(withOriginal?.id).toBe(1);
  });

  it('originalTitleの比較は大文字小文字を区別しない', () => {
    const candidates = [
      createMockMovie({
        id: 1,
        title: 'Some Title',
        original_title: 'THE MOVIE',
        release_date: '2026-03-01',
      }),
    ];

    const result = findBestMatch(
      candidates,
      { title: '別の映画', releaseDate: '2026-03-01', eigaUrl: null },
      'the movie',
    );

    expect(result?.id).toBe(1);
  });
});

describe('isRevival', () => {
  it('TMDbの公開日がiCalの日付より90日以上前ならtrueを返す', () => {
    expect(isRevival('2025-01-01', '2026-03-01')).toBe(true);
  });

  it('TMDbの公開日がiCalの日付よりちょうど90日前ならtrueを返す', () => {
    expect(isRevival('2025-12-02', '2026-03-02')).toBe(true);
  });

  it('TMDbの公開日がiCalの日付より89日前ならfalseを返す', () => {
    expect(isRevival('2026-01-01', '2026-03-31')).toBe(false);
  });

  it('TMDbの公開日がiCalの日付と同日ならfalseを返す', () => {
    expect(isRevival('2026-03-01', '2026-03-01')).toBe(false);
  });

  it('TMDbの公開日がnullならfalseを返す', () => {
    expect(isRevival(null, '2026-03-01')).toBe(false);
  });

  it('TMDbの公開日がiCalの日付より未来ならfalseを返す', () => {
    expect(isRevival('2026-06-01', '2026-03-01')).toBe(false);
  });
});

describe('syncEigaMovies', () => {
  // SyncResultの型テスト（既存）
  it('SyncResultの型が期待通りであること', () => {
    const result: SyncResult = {
      processed: 10,
      added: 5,
      skipped: 4,
      errors: ['映画A: エラー'],
    };

    expect(result.processed).toBe(10);
    expect(result.added).toBe(5);
    expect(result.skipped).toBe(4);
    expect(result.errors).toHaveLength(1);
  });

  // --- syncEigaMovies() 関数のテスト ---

  const mockFrom = jest.fn();
  const mockSelect = jest.fn();
  const mockUpsert = jest.fn();

  const mockedCreateClient = createClient as jest.MockedFunction<
    typeof createClient
  >;
  const mockedFetchEigaMovies = fetchEigaMovies as jest.MockedFunction<
    typeof fetchEigaMovies
  >;
  const mockedFetchOriginalTitle = fetchOriginalTitle as jest.MockedFunction<
    typeof fetchOriginalTitle
  >;
  const mockedSearchMovies = searchMovies as jest.MockedFunction<
    typeof searchMovies
  >;
  const mockedGetMovieKeywordIds = getMovieKeywordIds as jest.MockedFunction<
    typeof getMovieKeywordIds
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    mockSelect.mockResolvedValue({ data: [], error: null });
    mockUpsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'movie_cache') {
        return { select: mockSelect, upsert: mockUpsert };
      }
      return {};
    });
    mockedCreateClient.mockReturnValue({ from: mockFrom } as never);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('環境変数が未設定の場合にエラーをスローする', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(syncEigaMovies()).rejects.toThrow(
      'Supabase環境変数が設定されていません',
    );
  });

  it('NEXT_PUBLIC_SUPABASE_URLのみ未設定の場合にエラーをスローする', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    await expect(syncEigaMovies()).rejects.toThrow(
      'Supabase環境変数が設定されていません',
    );
  });

  it('SUPABASE_SERVICE_ROLE_KEYのみ未設定の場合にエラーをスローする', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(syncEigaMovies()).rejects.toThrow(
      'Supabase環境変数が設定されていません',
    );
  });

  it('iCalから映画を取得してTMDb検索でマッチングし、movie_cacheにupsertする', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [createMockMovie({ id: 100, title: 'テスト映画' })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedGetMovieKeywordIds.mockResolvedValue([]);

    const result = await syncEigaMovies();

    expect(result.processed).toBe(1);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 100,
        title: 'テスト映画',
        release_type: 'theatrical',
        is_revival: false,
      }),
      { onConflict: 'id,release_type' },
    );
  });

  it('TMDb検索でマッチしない場合にスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: 'マッチしない映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    });

    const result = await syncEigaMovies();

    expect(result.processed).toBe(1);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('原題フォールバック検索で再検索してマッチする', async () => {
    const eigaMovie: EigaMovie = {
      title: '邦題が違う映画',
      releaseDate: '2026-03-01',
      eigaUrl: 'https://eiga.com/movie/12345/',
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);

    // 最初の検索ではマッチなし
    mockedSearchMovies.mockResolvedValueOnce({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    });

    // 原題取得
    mockedFetchOriginalTitle.mockResolvedValue('The Original Title');

    // 原題での再検索でマッチ
    mockedSearchMovies.mockResolvedValueOnce({
      results: [
        createMockMovie({
          id: 200,
          title: 'The Original Title',
          original_title: 'The Original Title',
          release_date: '2026-03-01',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    mockedGetMovieKeywordIds.mockResolvedValue([]);

    const result = await syncEigaMovies();

    expect(result.added).toBe(1);
    expect(mockedFetchOriginalTitle).toHaveBeenCalledWith(
      'https://eiga.com/movie/12345/',
    );
    expect(mockedSearchMovies).toHaveBeenCalledTimes(2);
  });

  it('原題フォールバック検索でfetchOriginalTitleがnullを返した場合はスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: '邦題が違う映画',
      releaseDate: '2026-03-01',
      eigaUrl: 'https://eiga.com/movie/12345/',
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    });
    mockedFetchOriginalTitle.mockResolvedValue(null);

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
  });

  it('既にmovie_cacheに存在するIDをスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [createMockMovie({ id: 300, title: 'テスト映画' })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    // 既存データとして返す
    mockSelect.mockResolvedValue({
      data: [{ id: 300, release_type: 'theatrical' }],
      error: null,
    });

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('adultコンテンツをpost-filterでスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    // findBestMatchはadult=falseのみ通すが、bestMatch後のpost-filterもテスト
    // findBestMatchを通過させるために、adult=falseで返してからbestMatchの後にadult=trueに変わるケースは
    // 実際にはないので、ここではfindBestMatchの除外で結果的にスキップになるケースを確認
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({ id: 400, title: 'テスト映画', adult: true }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('除外言語のpost-filterでスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    // 除外言語はfindBestMatchでもフィルタされるため、
    // 他に候補がない場合はfindBestMatchがnullを返してスキップされる
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 500,
          title: 'テスト映画',
          original_language: 'ko',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
  });

  it('除外キーワードを含む映画をpost-filterでスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [createMockMovie({ id: 600, title: 'テスト映画' })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    // 除外キーワードIDを返す（155477 = softcore）
    mockedGetMovieKeywordIds.mockResolvedValue([155477]);

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('リバイバル上映の場合、iCalの日付をrelease_dateとして使用する', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 700,
          title: 'テスト映画',
          // 90日以上前 → リバイバル
          release_date: '2025-01-01',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedGetMovieKeywordIds.mockResolvedValue([]);

    const result = await syncEigaMovies();

    expect(result.added).toBe(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 700,
        release_date: '2026-03-01', // iCalの日付
        is_revival: true,
      }),
      { onConflict: 'id,release_type' },
    );
  });

  it('リバイバルでない場合、TMDbのrelease_dateを使用する', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 800,
          title: 'テスト映画',
          release_date: '2026-02-20',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedGetMovieKeywordIds.mockResolvedValue([]);

    const result = await syncEigaMovies();

    expect(result.added).toBe(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 800,
        release_date: '2026-02-20', // TMDbの日付
        is_revival: false,
      }),
      { onConflict: 'id,release_type' },
    );
  });

  it('UPSERTエラー時にerrorsに追加する', async () => {
    const eigaMovie: EigaMovie = {
      title: 'エラー映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [createMockMovie({ id: 900, title: 'エラー映画' })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedGetMovieKeywordIds.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({
      error: { message: 'DB書き込みエラー' },
    });

    const result = await syncEigaMovies();

    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('エラー映画: DB書き込みエラー');
  });

  it('個別映画処理中に例外が発生した場合、errorsに追加して処理を継続する', async () => {
    const eigaMovies: EigaMovie[] = [
      { title: '例外映画', releaseDate: '2026-03-01', eigaUrl: null },
      { title: '正常映画', releaseDate: '2026-03-05', eigaUrl: null },
    ];

    mockedFetchEigaMovies.mockResolvedValue(eigaMovies);

    // 1件目で例外
    mockedSearchMovies.mockRejectedValueOnce(new Error('API接続エラー'));

    // 2件目は正常
    mockedSearchMovies.mockResolvedValueOnce({
      results: [createMockMovie({ id: 1000, title: '正常映画' })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedGetMovieKeywordIds.mockResolvedValue([]);

    const result = await syncEigaMovies();

    expect(result.processed).toBe(2);
    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('例外映画: API接続エラー');
  });

  it('Error以外の例外が発生した場合、Unknown errorとしてerrorsに追加する', async () => {
    const eigaMovie: EigaMovie = {
      title: '不明例外映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockRejectedValue('string error');

    const result = await syncEigaMovies();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('不明例外映画: Unknown error');
  });

  it('iCalから映画が0件の場合、処理をスキップして空の結果を返す', async () => {
    mockedFetchEigaMovies.mockResolvedValue([]);

    const result = await syncEigaMovies();

    expect(result.processed).toBe(0);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('同一バッチ内で同じ映画が重複する場合、2件目はスキップする', async () => {
    const eigaMovies: EigaMovie[] = [
      { title: 'テスト映画', releaseDate: '2026-03-01', eigaUrl: null },
      { title: 'テスト映画', releaseDate: '2026-03-01', eigaUrl: null },
    ];

    mockedFetchEigaMovies.mockResolvedValue(eigaMovies);
    mockedSearchMovies.mockResolvedValue({
      results: [createMockMovie({ id: 1100, title: 'テスト映画' })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedGetMovieKeywordIds.mockResolvedValue([]);

    const result = await syncEigaMovies();

    expect(result.processed).toBe(2);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
