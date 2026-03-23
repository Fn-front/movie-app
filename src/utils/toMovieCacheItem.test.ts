/**
 * toMovieCacheItem 変換ユーティリティ テスト
 */

import type { AwardMovie } from '@/features/awards/types';
import type { Movie, NowShowingMovie } from '@/lib/types';
import type { Recommendation } from '@/schema/recommendations';

import {
  movieToMovieCacheItem,
  nowShowingToMovieCacheItem,
  recommendationToMovieCacheItem,
  awardMovieToMovieCacheItem,
} from './toMovieCacheItem';

describe('movieToMovieCacheItem', () => {
  const baseMovie: Movie = {
    id: 100,
    title: 'テスト映画',
    original_title: 'Test Movie',
    overview: '概要テキスト',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2026-01-01',
    vote_average: 8.0,
    vote_count: 500,
    popularity: 200,
    genre_ids: [28, 12],
    adult: false,
    original_language: 'ja',
  };

  it('Movie型をMovieCacheItemに正しく変換する', () => {
    const result = movieToMovieCacheItem(baseMovie);

    expect(result).toEqual({
      id: 100,
      title: 'テスト映画',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      release_date: '2026-01-01',
      overview: '概要テキスト',
      vote_average: 8.0,
      popularity: 200,
      genre_ids: [28, 12],
      release_type: 'theatrical',
      is_revival: false,
      favorite: undefined,
    });
  });

  it('お気に入り情報を含めて変換する', () => {
    const favorite = { id: 'fav-1', rating: 9 };
    const result = movieToMovieCacheItem(baseMovie, favorite);

    expect(result.favorite).toEqual({ id: 'fav-1', rating: 9 });
  });

  it('お気に入りがnullの場合はnullが設定される', () => {
    const result = movieToMovieCacheItem(baseMovie, null);

    expect(result.favorite).toBeNull();
  });
});

describe('nowShowingToMovieCacheItem', () => {
  const baseNowShowingMovie: NowShowingMovie = {
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

  it('NowShowingMovieをMovieCacheItemに正しく変換する', () => {
    const result = nowShowingToMovieCacheItem(baseNowShowingMovie);

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
    const result = nowShowingToMovieCacheItem(baseNowShowingMovie);
    expect(result.id).toBe(12345);
  });

  it('nullのフィールドが正しく設定される', () => {
    const movie: NowShowingMovie = {
      ...baseNowShowingMovie,
      poster_path: null,
      release_date: null,
      vote_average: null,
      popularity: null,
    };

    const result = nowShowingToMovieCacheItem(movie);

    expect(result.poster_path).toBeNull();
    expect(result.release_date).toBeNull();
    expect(result.vote_average).toBeNull();
    expect(result.popularity).toBeNull();
    expect(result.backdrop_path).toBeNull();
    expect(result.overview).toBeNull();
    expect(result.genre_ids).toBeNull();
  });
});

describe('recommendationToMovieCacheItem', () => {
  const baseRecommendation: Recommendation = {
    id: 'uuid-rec-1',
    tmdb_movie_id: 67890,
    title: 'おすすめ映画',
    poster_path: '/rec-poster.jpg',
    release_date: '2025-06-15',
    vote_average: 8.5,
    genre_ids: [18, 35],
    reason: '好みに合う映画です',
    display_order: 1,
  };

  it('RecommendationをMovieCacheItemに正しく変換する', () => {
    const result = recommendationToMovieCacheItem(baseRecommendation);

    expect(result).toEqual({
      id: 67890,
      title: 'おすすめ映画',
      poster_path: '/rec-poster.jpg',
      backdrop_path: null,
      release_date: '2025-06-15',
      overview: null,
      vote_average: 8.5,
      popularity: null,
      genre_ids: [18, 35],
      release_type: 'theatrical',
      is_revival: false,
    });
  });

  it('tmdb_movie_idがidにマッピングされる', () => {
    const result = recommendationToMovieCacheItem(baseRecommendation);
    expect(result.id).toBe(67890);
  });

  it('nullableフィールドが正しく処理される', () => {
    const rec: Recommendation = {
      ...baseRecommendation,
      poster_path: null,
      release_date: null,
      vote_average: null,
      genre_ids: null,
    };

    const result = recommendationToMovieCacheItem(rec);

    expect(result.poster_path).toBeNull();
    expect(result.release_date).toBeNull();
    expect(result.vote_average).toBeNull();
    expect(result.genre_ids).toBeNull();
    expect(result.backdrop_path).toBeNull();
    expect(result.overview).toBeNull();
    expect(result.popularity).toBeNull();
  });
});

describe('awardMovieToMovieCacheItem', () => {
  const baseAwardMovie: AwardMovie = {
    tmdbMovieId: 11111,
    title: '受賞映画',
    posterPath: '/award-poster.jpg',
    releaseDate: '2025-12-01',
    voteAverage: 8.5,
    genreIds: [18, 36],
    personName: null,
  };

  it('AwardMovieをMovieCacheItemに正しく変換する', () => {
    const result = awardMovieToMovieCacheItem(baseAwardMovie);

    expect(result).toEqual({
      id: 11111,
      title: '受賞映画',
      poster_path: '/award-poster.jpg',
      backdrop_path: null,
      release_date: '2025-12-01',
      overview: null,
      vote_average: 8.5,
      popularity: null,
      genre_ids: [18, 36],
      release_type: 'theatrical',
      is_revival: false,
    });
  });

  it('tmdbMovieIdがidにマッピングされる', () => {
    const result = awardMovieToMovieCacheItem(baseAwardMovie);
    expect(result.id).toBe(11111);
  });

  it('nullableフィールドが正しく処理される', () => {
    const movie: AwardMovie = {
      ...baseAwardMovie,
      posterPath: null,
      releaseDate: null,
      voteAverage: null,
      genreIds: null,
    };

    const result = awardMovieToMovieCacheItem(movie);

    expect(result.poster_path).toBeNull();
    expect(result.release_date).toBeNull();
    expect(result.vote_average).toBeNull();
    expect(result.genre_ids).toBeNull();
    expect(result.backdrop_path).toBeNull();
    expect(result.overview).toBeNull();
    expect(result.popularity).toBeNull();
  });
});
