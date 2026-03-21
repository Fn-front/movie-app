/**
 * awardMovieToMovieCacheItem 変換ユーティリティ テスト
 */

import type { AwardMovie } from '@/features/awards/types';

import { awardMovieToMovieCacheItem } from './toMovieCacheItem';

describe('awardMovieToMovieCacheItem', () => {
  const awardMovie: AwardMovie = {
    tmdbMovieId: 100,
    title: 'テスト映画',
    posterPath: '/poster.jpg',
    releaseDate: '2025-12-01',
    voteAverage: 8.5,
    genreIds: [18, 28],
  };

  it('AwardMovieをMovieCacheItemに変換する', () => {
    const result = awardMovieToMovieCacheItem(awardMovie);

    expect(result).toEqual({
      id: 100,
      title: 'テスト映画',
      poster_path: '/poster.jpg',
      backdrop_path: null,
      release_date: '2025-12-01',
      overview: null,
      vote_average: 8.5,
      popularity: null,
      genre_ids: [18, 28],
      release_type: 'theatrical',
      is_revival: false,
    });
  });

  it('null値が正しく変換される', () => {
    const nullAwardMovie: AwardMovie = {
      tmdbMovieId: 200,
      title: 'Null映画',
      posterPath: null,
      releaseDate: null,
      voteAverage: null,
      genreIds: null,
    };

    const result = awardMovieToMovieCacheItem(nullAwardMovie);

    expect(result.poster_path).toBeNull();
    expect(result.release_date).toBeNull();
    expect(result.vote_average).toBeNull();
    expect(result.genre_ids).toBeNull();
  });
});
