/**
 * Recommendation → MovieCacheItem 変換ユーティリティ
 */

import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { Recommendation } from '@/schema/recommendations';

/**
 * Recommendation を MovieCacheItem に変換する
 */
export function toMovieCacheItem(rec: Recommendation): MovieCacheItem {
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
