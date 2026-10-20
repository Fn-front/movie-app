/**
 * 公開日までの距離をラベル化するユーティリティ
 */

import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';

import { CALENDAR_PROXIMITY_LABELS } from '@/constants';

/**
 * 公開日と基準日の差を日本語ラベルにする
 *
 * カレンダーのグリッドは「いつ」しか示さないため、一覧側で「今日からどれだけ先か」を
 * 補う。時刻は無視し、暦日単位で比較する。
 *
 * @param releaseDate - 公開日（YYYY-MM-DD）
 * @param baseDate - 基準日（通常は今日）
 * @returns ラベル文字列。公開日が解釈できない場合は null
 *
 * @example
 * ```ts
 * formatReleaseProximity('2026-10-24', new Date(2026, 9, 21));
 * // => 'あと3日'
 * ```
 */
export function formatReleaseProximity(
  releaseDate: string,
  baseDate: Date,
): string | null {
  const parsed = parseISO(releaseDate);
  if (!isValid(parsed)) return null;

  const days = differenceInCalendarDays(parsed, baseDate);

  if (days === 0) return CALENDAR_PROXIMITY_LABELS.TODAY;
  if (days < 0) return CALENDAR_PROXIMITY_LABELS.RELEASED;
  return CALENDAR_PROXIMITY_LABELS.upcoming(days);
}
