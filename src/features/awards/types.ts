/**
 * 受賞作品機能の型定義
 */

/**
 * 受賞映画の基本情報
 */
export interface AwardMovie {
  tmdbMovieId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  genreIds: number[] | null;
  personName: string | null;
}

/**
 * カテゴリ別の受賞・ノミネート情報
 */
export interface AwardCategoryData {
  category: string;
  label: string;
  winner: AwardMovie | null;
  nominees: AwardMovie[];
}

/**
 * 賞ごとのデータ
 */
export interface AwardData {
  awardName: string;
  label: string;
  categories: AwardCategoryData[];
}

/**
 * 受賞作品APIレスポンス
 */
export interface AwardsResponseData {
  year: number;
  availableYears: number[];
  awards: AwardData[];
}

/**
 * 受賞作品APIレスポンス（ラッパー）
 */
export interface AwardsApiResponse {
  success: true;
  data: AwardsResponseData;
}
