/**
 * 時間関連の共通定数
 *
 * ミリ秒換算値を集約する。各ドメイン固有の TTL/期限は該当 constants に定義し、
 * ここでは基礎的な単位（1秒/1分/1時間/1日 のミリ秒）のみ提供する。
 */

/** 1 秒 = 1,000 ミリ秒 */
export const MS_PER_SECOND = 1_000;

/** 1 分 = 60,000 ミリ秒 */
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;

/** 1 時間 = 3,600,000 ミリ秒 */
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** 1 日 = 86,400,000 ミリ秒 */
export const MS_PER_DAY = 24 * MS_PER_HOUR;
