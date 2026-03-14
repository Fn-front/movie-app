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
  /** クレジット情報（append_to_response=credits使用時） */
  credits?: Credits;
  /** 配信プロバイダー情報（append_to_response=watch/providers使用時） */
  'watch/providers'?: WatchProviders;
  /** お気に入り情報（認証済みの場合のみ） */
  favorite?: { id: string; rating: number } | null;
}

/**
 * 配信プロバイダー型
 */
export interface WatchProvider {
  /** プロバイダーID */
  provider_id: number;
  /** プロバイダー名 */
  provider_name: string;
  /** ロゴパス */
  logo_path: string;
  /** 表示順 */
  display_priority: number;
}

/**
 * 国別配信情報型
 */
export interface WatchProviderCountry {
  /** TMDbページへのリンク */
  link: string;
  /** 定額配信（ストリーミング） */
  flatrate?: WatchProvider[];
  /** レンタル */
  rent?: WatchProvider[];
  /** 購入 */
  buy?: WatchProvider[];
}

/**
 * 配信プロバイダーレスポンス型（append_to_response用）
 */
export interface WatchProviders {
  /** 国コード別配信情報 */
  results: Record<string, WatchProviderCountry>;
}

/**
 * クレジット情報型
 */
export interface Credits {
  /** キャスト一覧 */
  cast: Cast[];
}

/**
 * キャスト型
 */
export interface Cast {
  /** キャストID */
  id: number;
  /** 俳優名 */
  name: string;
  /** 役名 */
  character: string;
  /** プロフィール画像パス */
  profile_path: string | null;
  /** 表示順 */
  order: number;
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
  /** ユーザー権限 */
  role: 'user' | 'admin';
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
}

/**
 * ソーシャルログインアカウント連携型（DBレコード）
 */
export interface Account {
  /** レコードID */
  id: string;
  /** ユーザーID */
  user_id: string;
  /** プロバイダー名 */
  provider: 'google' | 'github';
  /** プロバイダー側のアカウントID */
  provider_account_id: string;
  /** アカウント種別 */
  type: 'oauth';
  /** アクセストークン */
  access_token: string | null;
  /** リフレッシュトークン */
  refresh_token: string | null;
  /** トークン有効期限（UNIX timestamp） */
  expires_at: number | null;
  /** トークン種別 */
  token_type: string | null;
  /** スコープ */
  scope: string | null;
  /** IDトークン */
  id_token: string | null;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
}

/**
 * OTPアクション種別
 */
export type OtpActionType = 'registration' | 'login' | 'password_change';

/**
 * OTP検証コード型（DBレコード）
 */
export interface OtpCode {
  /** レコードID */
  id: string;
  /** 送信先メールアドレス */
  email: string;
  /** 6桁OTPコード */
  code: string;
  /** アクション種別 */
  action_type: OtpActionType;
  /** 検証試行回数 */
  attempts: number;
  /** 有効期限 */
  expires_at: string;
  /** 検証完了日時 */
  verified_at: string | null;
  /** 作成日時 */
  created_at: string;
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

/**
 * トレンド映画DBレコード型
 */
export interface TrendingMovie {
  /** レコードID */
  id: string;
  /** TMDb映画ID */
  tmdb_movie_id: number;
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string | null;
  /** 評価平均 */
  vote_average: number | null;
  /** 人気度 */
  popularity: number | null;
  /** 表示順（1〜10） */
  display_order: number;
  /** 最終同期日時 */
  fetched_at: string;
}

/**
 * TMDb Trending APIレスポンスの映画データ型
 */
export interface TMDbTrendingMovie {
  /** TMDb映画ID */
  id: number;
  /** タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string;
  /** 評価平均 */
  vote_average: number;
  /** 人気度 */
  popularity: number;
}

/**
 * TMDb リリース日レスポンスの個別リリース情報
 */
export interface TMDbReleaseDate {
  /** リリースタイプ（1:Premiere, 2:Theatrical limited, 3:Theatrical, 4:Digital, 5:Physical, 6:TV） */
  type: number;
  /** リリース日 */
  release_date: string;
}

/**
 * TMDb リリース日レスポンスの国別情報
 */
export interface TMDbReleaseDateCountry {
  /** 国コード（ISO 3166-1） */
  iso_3166_1: string;
  /** リリース日配列 */
  release_dates: TMDbReleaseDate[];
}

/**
 * アイコン共通プロパティ
 */
export interface IconProps {
  /** アイコンサイズ（px） */
  size?: number;
  /** カスタムクラス名 */
  className?: string;
}
