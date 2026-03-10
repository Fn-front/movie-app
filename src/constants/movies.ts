/**
 * 映画関連の定数
 */

import { errorMessage } from './common';

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
 * リリースタイプ選択肢
 */
export const RELEASE_TYPE_OPTIONS = [
  { label: '劇場公開', value: 'theatrical' },
  { label: 'ストリーミング', value: 'streaming' },
] as const;

/**
 * デフォルトリリースタイプ
 */
export const DEFAULT_RELEASE_TYPE = 'theatrical' as const;

/**
 * TMDb APIのwith_release_typeパラメータへのマッピング
 */
export const RELEASE_TYPE_MAP: Record<string, string> = {
  theatrical: '2|3',
  streaming: '4',
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
 * TMDb Discover APIで除外する原語（ISO 639-1）
 */
export const EXCLUDED_LANGUAGES = ['ko', 'zh'] as const;

/**
 * 映画.com iCalフィードURL
 */
export const EIGA_ICAL_URL = 'https://eiga.com/movie/coming.ics';

/**
 * バッチ更新: 1回のバッチで処理する映画数
 */
export const BATCH_UPDATE_SIZE = 100;

/**
 * 映画APIエラーメッセージ
 */
export const MOVIES_ERROR_MESSAGES = {
  /** クエリパラメータ不正 */
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
  /** 映画データ取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed('映画データ'),
} as const;
