import type { TrendingMovie } from '@/lib/types';

import { toMovieCacheItem } from './toMovieCacheItem';

describe('toMovieCacheItem', () => {
  const baseTrendingMovie: TrendingMovie = {
    id: 'uuid-1',
    tmdb_movie_id: 12345,
    title: 'テスト映画',
    poster_path: '/poster.jpg',
    release_date: '2026-03-01',
    vote_average: 7.5,
    popularity: 100,
    display_order: 1,
    fetched_at: '2026-03-14T00:00:00Z',
  };

  it('TrendingMovieをMovieCacheItemに正しく変換する', () => {
    const result = toMovieCacheItem(baseTrendingMovie);

    expect(result).toEqual({
      id: 12345,
      title: 'テスト映画',
      poster_path: '/poster.jpg',
      backdrop_path: null,
      release_date: '2026-03-01',
      overview: null,
      vote_average: 7.5,
      popularity: 100,
      genre_ids: null,
      release_type: 'theatrical',
      is_revival: false,
    });
  });

  it('tmdb_movie_idがidにマッピングされる', () => {
    const result = toMovieCacheItem(baseTrendingMovie);
    expect(result.id).toBe(12345);
  });

  it('nullのフィールドが正しく設定される', () => {
    const movie: TrendingMovie = {
      ...baseTrendingMovie,
      poster_path: null,
      release_date: null,
      vote_average: null,
      popularity: null,
    };

    const result = toMovieCacheItem(movie);

    expect(result.poster_path).toBeNull();
    expect(result.release_date).toBeNull();
    expect(result.vote_average).toBeNull();
    expect(result.popularity).toBeNull();
    expect(result.backdrop_path).toBeNull();
    expect(result.overview).toBeNull();
    expect(result.genre_ids).toBeNull();
  });

  it('release_typeが常にtheatricalになる', () => {
    const result = toMovieCacheItem(baseTrendingMovie);
    expect(result.release_type).toBe('theatrical');
  });

  it('is_revivalが常にfalseになる', () => {
    const result = toMovieCacheItem(baseTrendingMovie);
    expect(result.is_revival).toBe(false);
  });
});
