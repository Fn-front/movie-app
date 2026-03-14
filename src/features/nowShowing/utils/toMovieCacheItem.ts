/**
 * NowShowingMovie → MovieCacheItem 変換ユーティリティ
 */

import type { NowShowingMovie } from '@/lib/types';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

/**
 * NowShowingMovie を MovieCacheItem に変換する
 */
export function toMovieCacheItem(movie: NowShowingMovie): MovieCacheItem {
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
