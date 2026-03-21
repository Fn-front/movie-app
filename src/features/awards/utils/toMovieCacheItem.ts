/**
 * AwardMovie → MovieCacheItem 変換ユーティリティ
 */

import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { AwardMovie } from '@/features/awards/types';

export function awardMovieToMovieCacheItem(award: AwardMovie): MovieCacheItem {
  return {
    id: award.tmdbMovieId,
    title: award.title,
    poster_path: award.posterPath,
    backdrop_path: null,
    release_date: award.releaseDate,
    overview: null,
    vote_average: award.voteAverage,
    popularity: null,
    genre_ids: award.genreIds,
    release_type: 'theatrical',
    is_revival: false,
  };
}
