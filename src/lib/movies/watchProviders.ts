/**
 * 配信プロバイダーの正規化
 */

import { WATCH_PROVIDER_ALIASES, WATCH_PROVIDERS } from '@/constants';

/**
 * プロバイダーIDを代表IDへ正規化し、重複を除いて昇順に並べる
 *
 * TMDbは広告つきプランやAmazon Channel 経由を別IDで返すため、そのまま
 * 保存すると選択肢に同じサービスが二重に並ぶ。保存前にここを通す。
 *
 * 並び順を固定するのは、同じ内容の配列が更新のたびに違う順序で保存されるのを
 * 避けるため（差分が出ず、目視比較もしやすい）。
 *
 * @param providerIds - TMDbが返したプロバイダーID
 * @returns 正規化済みのプロバイダーID（昇順・重複なし）
 */
export function normalizeWatchProviderIds(providerIds: number[]): number[] {
  const normalized = providerIds.map((id) => WATCH_PROVIDER_ALIASES[id] ?? id);
  return [...new Set(normalized)].sort((a, b) => a - b);
}

/**
 * 絞り込みの選択肢として扱えるプロバイダーIDかを判定する
 *
 * 外部入力（手打ちURL・古いブックマーク・改変されたストレージ）から来た値を
 * そのままクエリに乗せないための検証に使う。
 *
 * @param providerId - 判定するプロバイダーID
 * @returns 選択肢に含まれる場合 true
 */
export function isSelectableWatchProvider(providerId: number): boolean {
  return WATCH_PROVIDERS.some((provider) => provider.id === providerId);
}
