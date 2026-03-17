/**
 * 映画.com関連の定数
 */

/**
 * 映画.com iCalフィード取得タイムアウト（ミリ秒）
 */
export const EIGA_FETCH_TIMEOUT_MS = 30000;

/**
 * 映画.com 原題取得タイムアウト（ミリ秒）
 */
export const EIGA_ORIGINAL_TITLE_TIMEOUT_MS = 10000;

/**
 * 映画.com URL正規表現パターン
 */
export const EIGA_URL_PATTERN = /https:\/\/eiga\.com\/movie\/\d+\//;

/**
 * 原題抽出正規表現パターン
 */
export const EIGA_ORIGINAL_TITLE_PATTERN =
  /原題(?:または英題)?[：:]\s*([^<\n]+)/;

/**
 * 英題抽出正規表現パターン
 */
export const EIGA_ENGLISH_TITLE_PATTERN = /英題[：:]\s*([^<\n]+)/;

/**
 * 映画.comスコアリング設定
 */
export const EIGA_SCORING = {
  /** タイトル完全一致ボーナス */
  TITLE_MATCH_BONUS: 1000,
  /** 日付近接度ベーススコア */
  DATE_PROXIMITY_BASE: 100,
  /** 人気度重み */
  POPULARITY_WEIGHT: 0.01,
  /** 最低マッチスコア閾値 */
  MIN_MATCH_SCORE: 50,
  /** リバイバル判定閾値（日数） */
  REVIVAL_THRESHOLD_DAYS: 90,
} as const;
