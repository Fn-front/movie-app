/**
 * 地域フィルタ: 表示に含める地域から、除外する原語を導出する
 */

import {
  REGION_GROUP_KEYS,
  REGION_LANGUAGE_GROUPS,
  type RegionGroupKey,
} from '@/constants/movies';

/**
 * 表示対象に含める地域から、除外する原語の一覧を導出する
 *
 * 未指定なら全グループを除外する。これが一覧の既定の挙動であり、
 * 「デフォルトは表示しない」をAPI層で担保する。UIの初期値に依存させると、
 * URL直叩き・初回のサーバーレンダリング・保存済みフィルタが無いユーザーで
 * 挙動がぶれる。
 *
 * @param includedRegions - 表示に含める地域グループ
 * @returns 除外する原語（ISO 639-1）の配列
 */
export function getExcludedLanguages(
  includedRegions: readonly RegionGroupKey[] = [],
): string[] {
  return REGION_GROUP_KEYS.filter(
    (key) => !includedRegions.includes(key),
  ).flatMap((key) => [...REGION_LANGUAGE_GROUPS[key]]);
}
