/**
 * 映画ユーティリティ
 */

import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';

/**
 * 公開済みかどうかを判定する
 *
 * お気に入りは1〜10の評価とセットで登録する機能なので、まだ観られない作品では
 * 登録導線を出さない。その判定に使う。
 *
 * `release_date` は「作品につき実質1つの代表日で、多くは劇場公開日」
 * （`src/lib/api/movies/movies.ts`）。`digital_release_date` では判定しない。
 * 配信開始前でも劇場では観られるため。
 *
 * 公開日が分からない場合は**公開済み扱い**にする。未公開である確証が無いのに
 * 機能を消さないため。
 *
 * @param releaseDate - 公開日（YYYY-MM-DD）。null や不正な値は公開済み扱い
 * @param baseDate - 基準日（通常は今日）
 * @returns 公開済みなら true
 *
 * @example
 * ```ts
 * isMovieReleased('2026-10-22', new Date(2026, 9, 21)); // => false
 * isMovieReleased(null, new Date(2026, 9, 21)); // => true
 * ```
 */
export function isMovieReleased(
  releaseDate: string | null | undefined,
  baseDate: Date,
): boolean {
  if (!releaseDate) return true;

  const parsed = parseISO(releaseDate);
  if (!isValid(parsed)) return true;

  // 公開日が基準日と同じか過去なら公開済み
  return differenceInCalendarDays(parsed, baseDate) <= 0;
}
