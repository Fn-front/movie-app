/**
 * 映画の品質フィルタ
 */

import {
  ALLOWED_LANGUAGES,
  MIN_POPULARITY,
  MIN_VOTE_AVERAGE,
} from '@/constants';
import type { Movie } from '@/lib/types';

/**
 * 品質フィルタで適用する条件の切り替え
 *
 * adult除外は常に適用され、ここでは無効化できない
 */
export interface QualityFilterOptions {
  /** 原語が許可リストに含まれることを要求する（既定: true） */
  requireLanguage?: boolean;
  /** ジャンルが1件以上あることを要求する（既定: true） */
  requireGenres?: boolean;
  /** 評価スコアが閾値以上であることを要求する（既定: true） */
  requireVoteAverage?: boolean;
  /** 人気度が閾値以上であることを要求する（既定: true） */
  requirePopularity?: boolean;
  /** 人気度の閾値（既定: MIN_POPULARITY）。配信カタログ等で緩める用途 */
  minPopularity?: number;
}

/**
 * 映画が品質基準を満たすか判定する
 *
 * TMDbから取得した映画を保存・表示してよいかの判定を1箇所に集約する。
 * 閾値（MIN_VOTE_AVERAGE / MIN_POPULARITY / ALLOWED_LANGUAGES）の変更が
 * この関数だけで完結し、呼び出し側ごとの表記揺れをなくす。
 *
 * adult の除外はオプションで無効化できない。取得元や経路によらず
 * 必ず弾かれることを保証するため（#569 の再発防止）。
 *
 * @param movie - 判定対象の映画
 * @param options - 適用する条件の切り替え
 * @returns 品質基準を満たす場合true
 */
export function isQualityMovie(
  movie: Movie,
  options: QualityFilterOptions = {},
): boolean {
  const {
    requireLanguage = true,
    requireGenres = true,
    requireVoteAverage = true,
    requirePopularity = true,
    minPopularity = MIN_POPULARITY,
  } = options;

  if (movie.adult) return false;

  if (requireLanguage) {
    const allowedLanguages: readonly string[] = ALLOWED_LANGUAGES;
    if (!allowedLanguages.includes(movie.original_language)) return false;
  }

  if (requireGenres && (movie.genre_ids ?? []).length === 0) return false;

  // 未評価（0）は新作で珍しくないため除外しない。
  // 評価が付いたうえで閾値未満のものだけ弾く
  if (
    requireVoteAverage &&
    movie.vote_average > 0 &&
    movie.vote_average < MIN_VOTE_AVERAGE
  ) {
    return false;
  }

  if (requirePopularity && movie.popularity < minPopularity) return false;

  return true;
}
