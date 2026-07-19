/**
 * 初期表示する劇場slugの解決
 */

import { DEFAULT_THEATER_SLUG } from '@/constants';

/**
 * URLクエリ由来の theater パラメータから初期表示slugを解決する。
 *
 * - 文字列かつ非空 → その値をそのまま採用
 * - 配列（?theater=a&theater=b の重複指定）/ 未指定 / 空文字 → 既定劇場にフォールバック
 *
 * @param raw searchParams から取り出した theater の生値
 * @returns 初期表示する劇場slug
 */
export function resolveInitialTheaterSlug(
  raw: string | string[] | undefined,
): string {
  return typeof raw === 'string' && raw.length > 0 ? raw : DEFAULT_THEATER_SLUG;
}
