/**
 * アプリケーション型定義
 */

/**
 * TMDb 映画データ型
 */
export interface Movie {
  /** 映画ID */
  id: number;
  /** タイトル */
  title: string;
  /** 原題 */
  original_title: string;
  /** 概要 */
  overview: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** バックドロップ画像パス */
  backdrop_path: string | null;
  /** 公開日 */
  release_date: string;
  /** 評価 */
  vote_average: number;
  /** 評価数 */
  vote_count: number;
  /** 人気度 */
  popularity: number;
  /** ジャンルID配列 */
  genre_ids: number[];
  /** 大人向けコンテンツフラグ */
  adult: boolean;
  /** 原語 */
  original_language: string;
}

/**
 * TMDb 映画詳細データ型
 */
export interface MovieDetail extends Omit<Movie, 'genre_ids'> {
  /** 上映時間（分） */
  runtime: number;
  /** ジャンル */
  genres: Genre[];
  /** 制作会社 */
  production_companies: ProductionCompany[];
  /** 制作国 */
  production_countries: ProductionCountry[];
  /** 話される言語 */
  spoken_languages: SpokenLanguage[];
  /** 予算 */
  budget: number;
  /** 収益 */
  revenue: number;
  /** タグライン */
  tagline: string;
  /** ステータス */
  status: string;
  /** ホームページURL */
  homepage: string | null;
}

/**
 * ジャンル型
 */
export interface Genre {
  /** ジャンルID */
  id: number;
  /** ジャンル名 */
  name: string;
}

/**
 * 制作会社型
 */
export interface ProductionCompany {
  /** 会社ID */
  id: number;
  /** 会社名 */
  name: string;
  /** ロゴパス */
  logo_path: string | null;
  /** 原産国 */
  origin_country: string;
}

/**
 * 制作国型
 */
export interface ProductionCountry {
  /** 国コード */
  iso_3166_1: string;
  /** 国名 */
  name: string;
}

/**
 * 言語型
 */
export interface SpokenLanguage {
  /** 言語コード */
  iso_639_1: string;
  /** 言語名 */
  name: string;
  /** 英語名 */
  english_name: string;
}

/**
 * TMDb APIレスポンス型（ページネーション付き）
 */
export interface TMDbResponse<T> {
  /** ページ番号 */
  page: number;
  /** 結果配列 */
  results: T[];
  /** 総ページ数 */
  total_pages: number;
  /** 総結果数 */
  total_results: number;
}

/**
 * ユーザー型
 */
export interface User {
  /** ユーザーID */
  id: string;
  /** メールアドレス */
  email: string;
  /** 表示名 */
  name: string | null;
  /** アバター画像URL */
  image: string | null;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
}

/**
 * ウォッチリスト型
 */
export interface Watchlist {
  /** ウォッチリストID */
  id: string;
  /** ユーザーID */
  user_id: string;
  /** 映画ID */
  movie_id: number;
  /** 映画タイトル */
  movie_title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string;
  /** 追加日時 */
  created_at: string;
}

/**
 * APIエラー型
 */
export interface ApiError {
  /** エラーメッセージ */
  message: string;
  /** HTTPステータスコード */
  statusCode?: number;
  /** エラー詳細 */
  details?: unknown;
}

/**
 * ページネーションパラメータ型
 */
export interface PaginationParams {
  /** ページ番号 */
  page?: number;
  /** 1ページあたりのアイテム数 */
  limit?: number;
}

/**
 * 映画検索パラメータ型
 */
export interface MovieSearchParams extends PaginationParams {
  /** 検索キーワード */
  query?: string;
  /** ジャンルID */
  genre?: number;
  /** 公開年 */
  year?: number;
  /** 最低評価 */
  vote_average_gte?: number;
  /** ソート順 */
  sort_by?: 'release_date' | 'popularity' | 'vote_average';
}

/**
 * ソート順型
 */
export type SortOrder = 'asc' | 'desc';

/**
 * テーマ型
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * 言語型
 */
export type Language = 'ja' | 'en';
