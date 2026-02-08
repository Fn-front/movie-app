/**
 * TMDb照合・DB補完ロジックのテスト
 */

// TMDbモジュールのモック（モジュールレベルの環境変数チェックを回避）
jest.mock('@/lib/tmdb/tmdb', () => ({
  searchMovies: jest.fn(),
}));

import type { Movie } from '@/lib/types';

import { findBestMatch, isRevival, type SyncResult } from './syncEigaMovies';
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
  // syncEigaMovies は外部依存（Supabase, TMDb API, HTTP）が多いため、
  // 結合テストはAPIルート経由で行う。
  // ここではSyncResultの型が正しいことを確認する。
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
});
