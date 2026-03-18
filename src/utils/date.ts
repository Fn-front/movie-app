/**
 * 日付ユーティリティ
 */

import { format as dateFnsFormat, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

import { DATE_FORMATS } from '@/constants';

/**
 * 日付を指定フォーマットで文字列化
 *
 * @param date - 日付（Date、ISO文字列、またはタイムスタンプ）
 * @param formatString - フォーマット文字列（date-fns形式）
 * @returns フォーマット済み日付文字列、またはnull
 *
 * @example
 * ```ts
 * formatDate('2024-01-15', 'yyyy年MM月dd日');
 * // => '2024年01月15日'
 *
 * formatDate(new Date(), 'yyyy/MM/dd');
 * // => '2024/01/15'
 * ```
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  formatString: string = DATE_FORMATS.DATE,
): string | null {
  if (!date) return null;

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
    return dateFnsFormat(dateObj, formatString, { locale: ja });
  } catch (error) {
    console.error('Date format error:', error);
    return null;
  }
}

/**
 * 日時を指定フォーマットで文字列化
 *
 * @param date - 日付（Date、ISO文字列、またはタイムスタンプ）
 * @param formatString - フォーマット文字列（date-fns形式）
 * @returns フォーマット済み日時文字列、またはnull
 *
 * @example
 * ```ts
 * formatDateTime('2024-01-15T10:30:00', 'yyyy年MM月dd日 HH:mm');
 * // => '2024年01月15日 10:30'
 *
 * formatDateTime(new Date(), 'yyyy/MM/dd HH:mm:ss');
 * // => '2024/01/15 10:30:45'
 * ```
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  formatString: string = DATE_FORMATS.DATE_TIME,
): string | null {
  return formatDate(date, formatString);
}

/**
 * 相対時間表示（「○分前」形式）
 *
 * @param date - 日付（Date、ISO文字列、またはタイムスタンプ）
 * @returns 相対時間文字列、またはnull
 *
 * @example
 * ```ts
 * formatRelativeTime(new Date(Date.now() - 1000 * 60 * 5));
 * // => '5分前'
 *
 * formatRelativeTime(new Date(Date.now() - 1000 * 60 * 60 * 24));
 * // => '1日前'
 * ```
 */
export function formatRelativeTime(
  date: Date | string | number | null | undefined,
): string | null {
  if (!date) return null;

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffSec < 60) return '今';
    if (diffMin < 60) return `${diffMin}分前`;
    if (diffHour < 24) return `${diffHour}時間前`;
    if (diffDay < 30) return `${diffDay}日前`;
    if (diffMonth < 12) return `${diffMonth}ヶ月前`;
    return `${diffYear}年前`;
  } catch (error) {
    console.error('Relative time format error:', error);
    return null;
  }
}

/**
 * 年のみを取得
 *
 * @param date - 日付（Date、ISO文字列、またはタイムスタンプ）
 * @returns 年、またはnull
 *
 * @example
 * ```ts
 * getYear('2024-01-15');
 * // => 2024
 * ```
 */
export function getYear(
  date: Date | string | number | null | undefined,
): number | null {
  if (!date) return null;

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
    return dateObj.getFullYear();
  } catch (error) {
    console.error('Year extraction error:', error);
    return null;
  }
}
