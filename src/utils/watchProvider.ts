/**
 * 配信プロバイダーの表示ユーティリティ
 */

import { WATCH_PROVIDERS } from '@/constants/movies';

/** カードに出すプロバイダーの表示情報 */
export interface WatchProviderDisplay {
  id: number;
  name: string;
  /** ロゴ画像の URL */
  logoUrl: string;
}

/** ロゴの表示サイズ。カードに並べる小さなアイコンなので w92 で足りる */
const LOGO_SIZE = 'w92';

/**
 * プロバイダーIDを表示用の情報に変換する
 *
 * `WATCH_PROVIDERS` に無いIDは落とす。TMDb は日本で71件のプロバイダーを返すが、
 * その34件は `KADOKAWA channel Amazon Channel` のような Amazon Channel 系で、
 * 小さなカードに並べても判別できないため。
 *
 * 並びは渡された順ではなく `WATCH_PROVIDERS` の定義順にする。
 * 作品ごとに同じサービスが違う位置に出ると視線が安定しないため。
 *
 * @param providerIds - 代表IDへ正規化済みのプロバイダーID
 * @returns 表示できるプロバイダーだけを定義順に並べたもの
 */
export function toDisplayProviders(
  providerIds: number[],
): WatchProviderDisplay[] {
  const target = new Set(providerIds);

  return WATCH_PROVIDERS.filter((provider) => target.has(provider.id)).map(
    (provider) => ({
      id: provider.id,
      name: provider.name,
      logoUrl: `https://image.tmdb.org/t/p/${LOGO_SIZE}${provider.logoPath}`,
    }),
  );
}
