/**
 * 各ソース型 → MovieCacheItem 変換ユーティリティ
 *
 * Movie / NowShowingMovie / Recommendation を統一的に MovieCacheItem へ変換する。
 * release_type / is_revival は各ソースAPIに含まれないため、デフォルト値を設定。
 */

import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { AwardMovie } from '@/features/awards/types';
import type { Movie, NowShowingMovie } from '@/lib/types';
import type { Recommendation } from '@/schema/recommendations';

/** Movie（検索API）→ MovieCacheItem */
export function movieToMovieCacheItem(
  movie: Movie,
  favorite?: MovieFavoriteInfo | null,
): MovieCacheItem {
  return {
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date,
    overview: movie.overview,
    vote_average: movie.vote_average,
    popularity: movie.popularity,
    genre_ids: movie.genre_ids,
    release_type: 'theatrical',
    is_revival: false,
    favorite,
  };
}

/** NowShowingMovie（劇場公開中）→ MovieCacheItem */
export function nowShowingToMovieCacheItem(
  movie: NowShowingMovie,
): MovieCacheItem {
  return {
    id: movie.tmdb_movie_id,
    title: movie.title,
    poster_path: movie.poster_path,
    backdrop_path: null,
    release_date: movie.release_date,
    overview: null,
    vote_average: movie.vote_average,
    popularity: movie.popularity,
    genre_ids: null,
    release_type: 'theatrical',
    is_revival: false,
  };
}

/** Recommendation（AIレコメンド）→ MovieCacheItem */
export function recommendationToMovieCacheItem(
  rec: Recommendation,
): MovieCacheItem {
  return {
    id: rec.tmdb_movie_id,
    title: rec.title,
    poster_path: rec.poster_path,
    backdrop_path: null,
    release_date: rec.release_date,
    overview: null,
    vote_average: rec.vote_average,
    popularity: null,
    genre_ids: rec.genre_ids,
    release_type: 'theatrical',
    is_revival: false,
  };
}

/** AwardMovie（受賞作品）→ MovieCacheItem */
export function awardMovieToMovieCacheItem(movie: AwardMovie): MovieCacheItem {
  return {
    id: movie.tmdbMovieId,
    title: movie.title,
    poster_path: movie.posterPath,
    backdrop_path: null,
    release_date: movie.releaseDate,
    overview: null,
    vote_average: movie.voteAverage,
    popularity: null,
    genre_ids: movie.genreIds,
    release_type: 'theatrical',
    is_revival: false,
  };
}
