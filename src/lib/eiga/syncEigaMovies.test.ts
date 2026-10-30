/**
 * TMDb照合・DB補完ロジックのテスト
 */

// TMDbモジュールのモック（モジュールレベルの環境変数チェックを回避）
jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: jest.fn(),
  hasExcludedKeyword: jest.fn(),
  getJpTheatricalReleaseDates: jest.fn(),
  getMovieKeywordIds: jest.fn().mockResolvedValue([]),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('./eiga', () => ({
  fetchEigaMovies: jest.fn(),
  fetchOriginalTitle: jest.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import { DOCUMENTARY_GENRE_ID, MUSIC_GENRE_ID } from '@/constants/movies';
import {
  searchMovies,
  hasExcludedKeyword,
  getJpTheatricalReleaseDates,
  getMovieKeywordIds,
} from '@/lib/tmdb/tmdb';
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

  it('iCal経由では言語フィルタなしで全候補を返す', () => {
    const candidates = [
      createMockMovie({
        id: 1,
        title: 'テスト映画',
        original_language: 'ko',
        release_date: '2026-03-01',
      }),
    ];

    const result = findBestMatch(candidates, eigaMovie);

    expect(result?.id).toBe(1);
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
  it('劇場公開がiCalの日付より90日以上前ならtrueを返す', () => {
    expect(isRevival(['2025-01-01'], '2026-03-01')).toBe(true);
  });

  it('劇場公開がiCalの日付よりちょうど90日前ならtrueを返す', () => {
    expect(isRevival(['2025-12-02'], '2026-03-02')).toBe(true);
  });

  it('劇場公開がiCalの日付より89日前ならfalseを返す', () => {
    expect(isRevival(['2026-01-01'], '2026-03-31')).toBe(false);
  });

  it('劇場公開がiCalの日付と同日ならfalseを返す', () => {
    expect(isRevival(['2026-03-01'], '2026-03-01')).toBe(false);
  });

  it('劇場公開がiCalの日付より未来ならfalseを返す', () => {
    expect(isRevival(['2026-06-01'], '2026-03-01')).toBe(false);
  });

  it('日本の劇場公開情報が無ければfalseを返す（過去の公開を確認できない）', () => {
    expect(isRevival([], '2026-03-01')).toBe(false);
  });

  it('複数の劇場公開のうち1つでも90日以上前ならtrueを返す（再上映）', () => {
    // 1996年の初公開 + 2026年の再上映
    expect(isRevival(['1996-09-14', '2026-09-04'], '2026-09-04')).toBe(true);
  });

  it('劇場公開が当該上映日しか無ければfalseを返す（新作）', () => {
    // プレミア（タイプ1）は渡されないため、新作は劇場公開1件のみになる
    expect(isRevival(['2026-10-30'], '2026-10-30')).toBe(false);
  });
});

describe('syncEigaMovies', () => {
  // SyncResultの型テスト（既存）
  it('SyncResultの型が期待通りであること', () => {
    const result: SyncResult = {
      processed: 10,
      added: 5,
      revivalCorrected: 1,
      skipped: 4,
      errors: ['映画A: エラー'],
    };

    expect(result.processed).toBe(10);
    expect(result.added).toBe(5);
    expect(result.revivalCorrected).toBe(1);
    expect(result.skipped).toBe(4);
    expect(result.errors).toHaveLength(1);
  });

  // --- syncEigaMovies() 関数のテスト ---

  const mockFrom = jest.fn();
  const mockSelect = jest.fn();
  /** 既存行問い合わせ（select(...).eq(...).in(...)）の終端 */
  const mockIn = jest.fn();
  const mockUpsert = jest.fn();
  /** 既存行のリバイバル補正（update(...).eq('id').eq('release_type')） */
  const mockUpdate = jest.fn();
  const mockUpdateEqId = jest.fn();
  const mockUpdateEqReleaseType = jest.fn();

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
  const mockedHasExcludedKeyword = hasExcludedKeyword as jest.MockedFunction<
    typeof hasExcludedKeyword
  >;
  const mockedGetJpTheatricalReleaseDates =
    getJpTheatricalReleaseDates as jest.MockedFunction<
      typeof getJpTheatricalReleaseDates
    >;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    // 既存ID問い合わせは候補IDだけを対象にする（全件SELECTは1000行上限にかかるため）
    // 既定では劇場公開履歴なし（＝リバイバルではない）
    mockedGetJpTheatricalReleaseDates.mockResolvedValue([]);
    mockIn.mockResolvedValue({ data: [], error: null });
    mockSelect.mockReturnValue({
      eq: jest.fn().mockReturnValue({ in: mockIn }),
    });
    mockUpsert.mockResolvedValue({ error: null });
    mockUpdateEqReleaseType.mockResolvedValue({ error: null });
    mockUpdateEqId.mockReturnValue({ eq: mockUpdateEqReleaseType });
    mockUpdate.mockReturnValue({ eq: mockUpdateEqId });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'movie_cache') {
        return { select: mockSelect, upsert: mockUpsert, update: mockUpdate };
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
    mockedHasExcludedKeyword.mockResolvedValue(false);

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

  it('upsert に original_language を含める', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 801,
          title: 'テスト映画',
          original_language: 'ko',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedHasExcludedKeyword.mockResolvedValue(false);

    await syncEigaMovies();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 801, original_language: 'ko' }),
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

    mockedHasExcludedKeyword.mockResolvedValue(false);

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

  describe('既存ID問い合わせ（1000行上限対策）', () => {
    /** iCal映画とTMDb検索結果をn件分用意する */
    const setupMovies = (count: number) => {
      const eigaMovies = Array.from({ length: count }, (_, i) => ({
        title: `映画${i + 1}`,
        releaseDate: '2026-03-01',
        eigaUrl: null,
      }));
      mockedFetchEigaMovies.mockResolvedValue(eigaMovies);
      mockedSearchMovies.mockImplementation(async (params) => {
        const index = Number(String(params.query).replace('映画', '')) - 1;
        return {
          results: [
            createMockMovie({ id: 1000 + index, title: `映画${index + 1}` }),
          ],
          page: 1,
          total_pages: 1,
          total_results: 1,
        };
      });
      return eigaMovies;
    };

    it('全件SELECTではなく候補IDを指定して問い合わせる', async () => {
      setupMovies(3);
      mockedHasExcludedKeyword.mockResolvedValue(false);

      await syncEigaMovies();

      // release_type で絞り、候補IDだけを in() で指定する。
      // リバイバル補正の要否を判定するため release_date / is_revival も取る
      expect(mockSelect).toHaveBeenCalledWith('id, release_date, is_revival');
      expect(mockIn).toHaveBeenCalledTimes(1);
      expect(mockIn).toHaveBeenCalledWith('id', [1000, 1001, 1002]);
    });

    it('候補が200件を超える場合は分割して問い合わせる（URL長対策）', async () => {
      setupMovies(250);
      mockedHasExcludedKeyword.mockResolvedValue(false);

      await syncEigaMovies();

      expect(mockIn).toHaveBeenCalledTimes(2);
      expect(mockIn.mock.calls[0][1]).toHaveLength(200);
      expect(mockIn.mock.calls[1][1]).toHaveLength(50);
    });

    it('1000件を超える候補でも全件が重複判定される', async () => {
      setupMovies(1200);
      // 全件が既存として返る
      mockIn.mockImplementation(async (_column: string, ids: number[]) => ({
        data: ids.map((id) => ({ id })),
        error: null,
      }));
      mockedHasExcludedKeyword.mockResolvedValue(false);

      const result = await syncEigaMovies();

      // 1件もUPSERTされない（全件が既存と判定される）
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(1200);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('既存IDの映画ではキーワード判定とUPSERTを行わない', async () => {
      setupMovies(2);
      mockIn.mockResolvedValue({ data: [{ id: 1000 }], error: null });
      mockedHasExcludedKeyword.mockResolvedValue(false);

      const result = await syncEigaMovies();

      // 既存の1件はTMDbキーワード取得をスキップする
      expect(mockedHasExcludedKeyword).toHaveBeenCalledTimes(1);
      expect(mockedHasExcludedKeyword).toHaveBeenCalledWith(1001);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(result.added).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('既存ID取得に失敗した場合は例外をスローする（silent truncationを避ける）', async () => {
      setupMovies(2);
      mockIn.mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      });

      await expect(syncEigaMovies()).rejects.toThrow(
        '既存ID取得エラー: connection refused',
      );
    });

    it('候補が0件の場合は既存ID問い合わせを行わない', async () => {
      mockedFetchEigaMovies.mockResolvedValue([
        { title: 'マッチしない映画', releaseDate: '2026-03-01', eigaUrl: null },
      ]);
      mockedSearchMovies.mockResolvedValue({
        results: [],
        page: 1,
        total_pages: 1,
        total_results: 0,
      });

      const result = await syncEigaMovies();

      expect(mockIn).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });
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
    mockIn.mockResolvedValue({
      data: [{ id: 300 }],
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
      results: [createMockMovie({ id: 400, title: 'テスト映画', adult: true })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('iCal経由では言語フィルタなしで保存する', async () => {
    const eigaMovie: EigaMovie = {
      title: 'テスト映画',
      releaseDate: '2026-03-01',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 500,
          title: 'テスト映画',
          original_language: 'ko',
          release_date: '2026-03-01',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    (hasExcludedKeyword as jest.Mock).mockResolvedValue(false);

    const result = await syncEigaMovies();

    expect(result.added).toBe(1);
    expect(mockUpsert).toHaveBeenCalled();
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
    mockedHasExcludedKeyword.mockResolvedValue(true);

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('舞台中継をpost-filterでスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: '舞台『龍が如く』-神室町八犬伝-',
      releaseDate: '2026-08-29',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 620,
          title: '舞台『龍が如く』-神室町八犬伝-',
          genre_ids: [28, 18],
          release_date: '2026-08-29',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedHasExcludedKeyword.mockResolvedValue(false);

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('ライブ興行作品をpost-filterでスキップする', async () => {
    const eigaMovie: EigaMovie = {
      title: 'ヨルシカ LIVE「盗作」',
      releaseDate: '2026-10-09',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 610,
          title: 'ヨルシカ LIVE「盗作」',
          genre_ids: [MUSIC_GENRE_ID],
          release_date: '2026-10-09',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedHasExcludedKeyword.mockResolvedValue(false);

    const result = await syncEigaMovies();

    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('同じジャンル構成でも音楽ドキュメンタリーは保存する', async () => {
    const eigaMovie: EigaMovie = {
      title: 'オアシス：ドント・ルック・バック・イン・アンガー',
      releaseDate: '2026-09-11',
      eigaUrl: null,
    };

    mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
    mockedSearchMovies.mockResolvedValue({
      results: [
        createMockMovie({
          id: 611,
          title: 'オアシス：ドント・ルック・バック・イン・アンガー',
          genre_ids: [MUSIC_GENRE_ID, DOCUMENTARY_GENRE_ID],
          release_date: '2026-09-11',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedHasExcludedKeyword.mockResolvedValue(false);
    (getMovieKeywordIds as jest.Mock).mockResolvedValue([165194]);

    const result = await syncEigaMovies();

    expect(result.added).toBe(1);
    expect(mockUpsert).toHaveBeenCalled();
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
          release_date: '2025-01-01',
        }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });
    mockedHasExcludedKeyword.mockResolvedValue(false);
    // 90日以上前の劇場公開がある → リバイバル
    mockedGetJpTheatricalReleaseDates.mockResolvedValue(['2025-01-01']);

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

  describe('リバイバル誤判定の回帰（本番で発生したケース）', () => {
    /** iCal 1件 + TMDb検索結果1件を用意する */
    const setupSingle = (movieId: number, tmdbReleaseDate: string) => {
      const eigaMovie: EigaMovie = {
        title: 'テスト映画',
        releaseDate: '2026-10-30',
        eigaUrl: null,
      };
      mockedFetchEigaMovies.mockResolvedValue([eigaMovie]);
      mockedSearchMovies.mockResolvedValue({
        results: [
          createMockMovie({
            id: movieId,
            title: 'テスト映画',
            release_date: tmdbReleaseDate,
          }),
        ],
        page: 1,
        total_pages: 1,
        total_results: 1,
      });
      mockedHasExcludedKeyword.mockResolvedValue(false);
    };

    it('プレミアの約1年後に劇場公開される新作をリバイバル扱いしない', async () => {
      // 恒星の向こう側: type1(プレミア) 2025-10-29 / type3(劇場) 2026-10-30
      setupSingle(1555226, '2026-10-30');
      // プレミアは除外され、劇場公開1件だけが渡る
      mockedGetJpTheatricalReleaseDates.mockResolvedValue(['2026-10-30']);

      await syncEigaMovies();

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1555226,
          is_revival: false,
          release_date: '2026-10-30',
        }),
        expect.anything(),
      );
    });

    it('過去に劇場公開がある再上映はリバイバルと判定する', async () => {
      // スワロウテイル: type3 1996-09-14 / type3 2026-09-04
      setupSingle(8426, '1996-09-14');
      mockedGetJpTheatricalReleaseDates.mockResolvedValue([
        '1996-09-14',
        '2026-09-04',
      ]);

      await syncEigaMovies();

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 8426,
          is_revival: true,
          // iCalの上映日を使う
          release_date: '2026-10-30',
        }),
        expect.anything(),
      );
    });

    it('既存IDはUPSERTしない（新規追加の経路には乗せない）', async () => {
      setupSingle(900, '2026-10-30');
      mockIn.mockResolvedValue({
        data: [{ id: 900, release_date: '2026-10-30', is_revival: false }],
        error: null,
      });

      await syncEigaMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('既存行のリバイバル補正', () => {
    /**
     * iCal 1件 + TMDb検索結果1件を用意し、その映画を既存行として返す
     *
     * 南極料理人（TMDb 106378）の再現: Discover 経由で先に代表公開日のまま
     * 保存され、iCal 同期が「既存だから」と素通りしていたケース。
     */
    const setupExisting = (
      existingRow: {
        release_date: string | null;
        is_revival: boolean;
      },
      eigaReleaseDate = '2026-11-13',
    ) => {
      mockedFetchEigaMovies.mockResolvedValue([
        {
          title: '南極料理人',
          releaseDate: eigaReleaseDate,
          eigaUrl: null,
        },
      ]);
      mockedSearchMovies.mockResolvedValue({
        results: [
          createMockMovie({
            id: 106378,
            title: '南極料理人',
            release_date: '2009-08-08',
          }),
        ],
        page: 1,
        total_pages: 1,
        total_results: 1,
      });
      mockedHasExcludedKeyword.mockResolvedValue(false);
      mockIn.mockResolvedValue({
        data: [{ id: 106378, ...existingRow }],
        error: null,
      });
    };

    it('既存行がリバイバルならiCalの上映日とis_revivalを補正する', async () => {
      setupExisting({ release_date: '2009-08-08', is_revival: false });
      mockedGetJpTheatricalReleaseDates.mockResolvedValue([
        '2009-08-08',
        '2026-11-13',
      ]);

      const result = await syncEigaMovies();

      expect(mockUpdate).toHaveBeenCalledWith({
        release_date: '2026-11-13',
        is_revival: true,
        updated_at: expect.any(String),
      });
      expect(mockUpdateEqId).toHaveBeenCalledWith('id', 106378);
      expect(mockUpdateEqReleaseType).toHaveBeenCalledWith(
        'release_type',
        'theatrical',
      );
      expect(result.revivalCorrected).toBe(1);
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('既存行がリバイバルでなければ更新しない', async () => {
      setupExisting({ release_date: '2026-11-13', is_revival: false });
      // 90日以上前の劇場公開が無い＝再上映ではない
      mockedGetJpTheatricalReleaseDates.mockResolvedValue(['2026-11-13']);

      const result = await syncEigaMovies();

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(result.revivalCorrected).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('既に補正済みの行ではTMDbを呼ばない（週次の再問い合わせを避ける）', async () => {
      setupExisting({ release_date: '2026-11-13', is_revival: true });

      const result = await syncEigaMovies();

      expect(mockedGetJpTheatricalReleaseDates).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });

    it('is_revivalが立っていても上映日がズレていれば補正する', async () => {
      // 前回の補正後に iCal 側の上映日が変わったケース
      setupExisting({ release_date: '2026-11-06', is_revival: true });
      mockedGetJpTheatricalReleaseDates.mockResolvedValue([
        '2009-08-08',
        '2026-11-13',
      ]);

      const result = await syncEigaMovies();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ release_date: '2026-11-13' }),
      );
      expect(result.revivalCorrected).toBe(1);
    });

    it('補正のUPDATEが失敗した場合はerrorsに追加する', async () => {
      setupExisting({ release_date: '2009-08-08', is_revival: false });
      mockedGetJpTheatricalReleaseDates.mockResolvedValue([
        '2009-08-08',
        '2026-11-13',
      ]);
      mockUpdateEqReleaseType.mockResolvedValue({
        error: { message: 'DB書き込みエラー' },
      });

      const result = await syncEigaMovies();

      expect(result.revivalCorrected).toBe(0);
      expect(result.errors).toEqual(['南極料理人: DB書き込みエラー']);
    });

    it('同じ既存映画が複数エントリにマッチしても補正は1回だけ行う', async () => {
      setupExisting({ release_date: '2009-08-08', is_revival: false });
      mockedFetchEigaMovies.mockResolvedValue([
        { title: '南極料理人', releaseDate: '2026-11-13', eigaUrl: null },
        { title: '南極料理人', releaseDate: '2026-11-13', eigaUrl: null },
      ]);
      mockedGetJpTheatricalReleaseDates.mockResolvedValue([
        '2009-08-08',
        '2026-11-13',
      ]);

      const result = await syncEigaMovies();

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(result.revivalCorrected).toBe(1);
      expect(result.skipped).toBe(1);
    });
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
    mockedHasExcludedKeyword.mockResolvedValue(false);

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
    mockedHasExcludedKeyword.mockResolvedValue(false);
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
    mockedHasExcludedKeyword.mockResolvedValue(false);

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
    mockedHasExcludedKeyword.mockResolvedValue(false);

    const result = await syncEigaMovies();

    expect(result.processed).toBe(2);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
