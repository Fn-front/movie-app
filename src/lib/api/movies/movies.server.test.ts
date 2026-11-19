/**
 * @jest-environment node
 */

/**
 * 映画API（サーバーサイド用） テスト
 *
 * `person.server.test.ts` と同型。ルート側は `getCachedMovieDetail` を
 * モックするため、`unstable_cache` の指定（キー・revalidate）を固定できるのは
 * ここだけ（#1273）。
 */

import {
  API,
  MOVIE_DETAIL_REVALIDATE_SECONDS,
  TMDB_MOVIE_DETAIL_APPEND,
  TMDB_VIDEO_LANGUAGES,
} from '@/constants';

// --- Mocks ---

// unstable_cache はモジュール評価時に即座に呼ばれるため、
// ファクトリ内で完結させる（外の変数を参照すると TDZ で落ちる）
jest.mock('next/cache', () => ({
  unstable_cache: jest.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

import { unstable_cache } from 'next/cache';

const mockUnstableCache = unstable_cache as jest.Mock;

const mockGetMovieDetail = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  getMovieDetail: (...args: unknown[]) => mockGetMovieDetail(...args),
}));

import { getCachedMovieDetail } from './movies.server';

// --- Tests ---

describe('getCachedMovieDetail', () => {
  beforeEach(() => {
    mockGetMovieDetail.mockReset();
  });

  it('映画詳細のキャッシュ期間をCache-Controlと揃えている', () => {
    expect(mockUnstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      expect.arrayContaining(['movie-detail']),
      { revalidate: MOVIE_DETAIL_REVALIDATE_SECONDS },
    );
  });

  /**
   * ⚠️ TMDb のリクエスト内容をキーに含める（#1273 のレビュー指摘）
   *
   * `unstable_cache` のキーは「コールバックの文字列 ＋ keyParts ＋ 引数」。
   * コールバック本体は `(movieId) => getMovieDetail(movieId)` のままなので、
   * **定数の値を変えただけではキーが変わらない**。しかもキャッシュは
   * デプロイをまたいで残るため、append を増やしても最大24時間は
   * 新フィールドの欠けた応答が返り続ける。
   */
  it('取得内容が変わる定数をキャッシュキーに含めている', () => {
    const keyParts = mockUnstableCache.mock.calls[0][1] as string[];

    expect(keyParts).toContain(TMDB_MOVIE_DETAIL_APPEND);
    expect(keyParts).toContain(TMDB_VIDEO_LANGUAGES);
    expect(keyParts).toContain(API.TMDB_LANGUAGE);
  });

  it('TMDbの映画詳細をそのまま返す', async () => {
    const movie = { id: 123, title: 'テスト映画' };
    mockGetMovieDetail.mockResolvedValue(movie);

    await expect(getCachedMovieDetail(123)).resolves.toEqual(movie);
    expect(mockGetMovieDetail).toHaveBeenCalledWith(123);
  });

  /**
   * 例外をキャッシュしないこと
   *
   * ここが崩れると、TMDb の一時障害や 404 が24時間固定される。
   * ルート側の「404 はそのまま 404 で返す」も成立しなくなる
   */
  it('TMDbのエラーはそのまま投げる（キャッシュに載せない）', async () => {
    mockGetMovieDetail.mockRejectedValue(new Error('TMDb error'));

    await expect(getCachedMovieDetail(123)).rejects.toThrow('TMDb error');
  });
});
