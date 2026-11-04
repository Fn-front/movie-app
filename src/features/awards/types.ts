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
   * 行ごとに持つ。部門に受賞を1件だけ持たせる形では2件目を落とす
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
   * 受賞・ノミネートを問わず、その部門の全行（`display_order` 昇順）
   *
   * 受賞だけを別フィールドで持たせない。同点受賞があるため1件では足りず、
   * 2つの表現があるとどちらが正かを常に気にすることになる。
   * 受賞は `nominees.filter((n) => n.isWinner)` で取る
   */
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
