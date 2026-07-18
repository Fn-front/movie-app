/**
 * 映画関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * ソート選択肢
 */
export const SORT_OPTIONS = [
  { label: '公開日順', value: 'release_date' },
  { label: '人気順', value: 'popularity' },
  { label: '評価順', value: 'vote_average' },
] as const;

/**
 * デフォルトソート
 */
export const DEFAULT_SORT = 'release_date' as const;

/**
 * キャッシュ有効時間（時間）
 */
export const CACHE_DURATION_HOURS = 6;

/**
 * Now Playing キャッシュ有効時間（時間）
 */
export const NOW_PLAYING_CACHE_DURATION_HOURS = 24;

/**
 * 映画取得範囲（何ヶ月先まで）
 */
export const MOVIES_FETCH_MONTHS_AHEAD = 3;

/**
 * 公開中映画の取得範囲（何ヶ月前まで）
 */
export const NOW_SHOWING_MONTHS_BACK = 2;

/**
 * リリースタイプ値（このファイル内のリリースタイプの単一ソース）
 */
export const RELEASE_TYPE = {
  THEATRICAL: 'theatrical',
  STREAMING: 'streaming',
} as const;

/**
 * リリースタイプ選択肢
 */
export const RELEASE_TYPE_OPTIONS = [
  { label: '劇場公開', value: RELEASE_TYPE.THEATRICAL },
  { label: 'ストリーミング', value: RELEASE_TYPE.STREAMING },
] as const;

/**
 * デフォルトリリースタイプ
 */
export const DEFAULT_RELEASE_TYPE = RELEASE_TYPE.THEATRICAL;

/**
 * TMDb APIのwith_release_typeパラメータへのマッピング
 */
export const RELEASE_TYPE_MAP: Record<string, string> = {
  [RELEASE_TYPE.THEATRICAL]: '2|3',
  [RELEASE_TYPE.STREAMING]: '4',
};

/**
 * 映画フィルタリング: 最低評価スコア（これ未満は除外）
 */
export const MIN_VOTE_AVERAGE = 3;

/**
 * 映画フィルタリング: 最低人気度（評価済みでもこれ未満は除外）
 */
export const MIN_POPULARITY = 0.5;

/**
 * TMDb Discover APIで除外するジャンルID
 */
export const EXCLUDED_GENRE_IDS = [
  10770, // TV Movie
] as const;

/**
 * TMDb Discover APIのwithout_genresパラメータ値
 */
export const EXCLUDED_GENRES_PARAM = EXCLUDED_GENRE_IDS.join('|');

/**
 * TMDb Discover APIで除外するキーワードID
 * 不適切コンテンツ（softcore, ポルノ, ピンク映画等）を除外する
 */
export const EXCLUDED_KEYWORD_IDS = [
  155477, // softcore
  190370, // erotic movie
  10053, // sexploitation
  445, // pornography
  260863, // hardcore
  198385, // hentai
  161919, // adult animation
  159551, // pink film
] as const;

/**
 * TMDb Discover APIのwithout_keywordsパラメータ値
 */
export const EXCLUDED_KEYWORDS_PARAM = EXCLUDED_KEYWORD_IDS.join('|');

/**
 * 許可する原語（ISO 639-1）
 * この一覧に含まれない言語の映画は除外される
 */
export const ALLOWED_LANGUAGES = [
  'ja', // 日本語
  'en', // 英語
  'fr', // フランス語
  'de', // ドイツ語
  'es', // スペイン語
  'it', // イタリア語
  'no', // ノルウェー語
  'sv', // スウェーデン語
  'da', // デンマーク語
  'hi', // ヒンディー語
  'te', // テルグ語
  'ta', // タミル語
] as const;

/**
 * バッチ更新: 1回のバッチで処理する映画数
 */
export const BATCH_UPDATE_SIZE = 100;

/**
 * ジャンルキャッシュ有効期間（ミリ秒） — 24時間
 */
export const GENRE_CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Discover API 最大ページ数
 */
export const DISCOVER_API_MAX_PAGES = 5;

/**
 * Now Playing 同期 最大ページ数
 */
export const NOW_PLAYING_SYNC_MAX_PAGES = 10;

/**
 * 劇場公開中映画の公開日範囲（月数）
 */
export const NOW_SHOWING_RELEASE_DATE_RANGE_MONTHS = 3;

/**
 * 公開年バリデーション範囲
 */
export const MOVIE_YEAR_RANGE = {
  MIN: 1888,
  MAX: 2100,
} as const;

/**
 * 映画APIエラーメッセージ
 */
export const MOVIES_ERROR_MESSAGES = {
  /** クエリパラメータ不正 */
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
  /** 映画データ取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed('映画データ'),
  /** 映画ID不正 */
  INVALID_MOVIE_ID: errorMessage.invalid('映画ID'),
  /** 映画未検出 */
  NOT_FOUND: errorMessage.notFound('映画'),
} as const;

/**
 * 映画API成功メッセージ
 */
export const MOVIES_SUCCESS_MESSAGES = {
  /** 映画キャッシュ更新完了 */
  CACHE_UPDATED: successMessage.updated('映画キャッシュ'),
} as const;
