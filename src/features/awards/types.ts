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
  /**
   * この行が受賞かどうか
   *
   * 同点受賞（複数作品が同じ部門を同時受賞）があるため、受賞かどうかは
   * 行ごとに持つ必要がある。`AwardCategoryData.winner` との一致では判定できない
   */
  isWinner: boolean;
}

/**
 * カテゴリ別の受賞・ノミネート情報
 */
export interface AwardCategoryData {
  category: string;
  label: string;
  /**
   * 受賞のうち最初の1件
   *
   * ⚠️ 同点受賞ではここに1件しか入らない。表示側は `nominees` を
   * `isWinner` で振り分けること
   */
  winner: AwardMovie | null;
  /** 受賞・ノミネートを問わず、その部門の全行 */
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
