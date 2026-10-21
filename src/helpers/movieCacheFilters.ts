/**
 * movie_cache クエリのフィルタ適用ヘルパ
 */

import {
  WATCH_PROVIDER_OFFER_TYPES,
  type WatchProviderOfferType,
} from '@/constants';

/**
 * movie_cache クエリに適用するフィルタ条件
 */
export interface MovieCacheFilters {
  /** リリースタイプ（theatrical / streaming） */
  releaseType: string;
  /** 公開中（劇場）フラグで絞り込むか */
  isNowPlayingTheatrical: boolean;
  /** JP配信中フラグ（undefined なら絞り込まない） */
  isCurrentlyStreaming?: boolean;
  /** デジタル公開日の下限（これより後、YYYY-MM-DD。undefined なら絞り込まない） */
  digitalReleaseDateGt?: string;
  /** 公開日の下限（YYYY-MM-DD） */
  dateGte?: string;
  /** 公開日の上限（YYYY-MM-DD） */
  dateLte?: string;
  /** リバイバル上映フラグ（undefined なら絞り込まない） */
  isRevival?: boolean;
  /** 絞り込むジャンルID（空配列ならジャンル指定なし） */
  genreIds: number[];
  /** 絞り込む配信プロバイダーID（空配列ならプロバイダー指定なし） */
  watchProviderIds: number[];
  /** 対象とする提供形態（空配列なら全形態） */
  watchProviderOfferTypes: WatchProviderOfferType[];
}

/**
 * フィルタ適用に必要な最小限のクエリビルダー
 *
 * 総件数クエリ（`select('id', { count: 'exact', head: true })`）と
 * データ取得クエリでは select の型が異なるため、PostgrestFilterBuilder を
 * 直接受けず、使用するメソッドだけを構造的に要求する
 */
interface MovieCacheQueryBuilder {
  eq(column: string, value: string | boolean): this;
  gt(column: string, value: string): this;
  gte(column: string, value: string): this;
  lte(column: string, value: string): this;
  or(filters: string): this;
}

/**
 * movie_cache クエリにフィルタ条件を適用する
 *
 * 総件数クエリとデータ取得クエリで条件がずれると、総件数と実データが
 * 食い違ってページング（hasNextPage）判定が壊れる。両クエリを必ず
 * この関数に通すことで、条件の適用漏れを構造的に防ぐ。
 *
 * @param query - フィルタを適用するクエリ
 * @param filters - 適用するフィルタ条件
 * @returns フィルタ適用後のクエリ
 */
export function applyMovieCacheFilters<T>(
  query: T,
  filters: MovieCacheFilters,
): T {
  // Supabaseのクエリビルダー型は select の内容ごとに変わるうえ巨大で、
  // 型引数の制約（`T extends MovieCacheQueryBuilder`）や交差型で受けると
  // 型のインスタンス化が深くなりすぎてコンパイルエラーになる（TS2589）。
  // そのため使用するメソッドだけを持つ最小の型に落として組み立て、
  // 呼び出し元へは元の型のまま返す
  let filtered = (query as MovieCacheQueryBuilder).eq(
    'release_type',
    filters.releaseType,
  );

  if (filters.isNowPlayingTheatrical) {
    filtered = filtered.eq('is_now_playing', true);
  }

  if (filters.isCurrentlyStreaming !== undefined) {
    filtered = filtered.eq(
      'is_currently_streaming',
      filters.isCurrentlyStreaming,
    );
  }

  if (filters.digitalReleaseDateGt) {
    filtered = filtered.gt(
      'digital_release_date',
      filters.digitalReleaseDateGt,
    );
  }

  if (filters.dateGte) {
    filtered = filtered.gte('release_date', filters.dateGte);
  }

  if (filters.dateLte) {
    filtered = filtered.lte('release_date', filters.dateLte);
  }

  if (filters.isRevival !== undefined) {
    filtered = filtered.eq('is_revival', filters.isRevival);
  }

  if (filters.genreIds.length > 0) {
    const orConditions = filters.genreIds
      .map((id) => `genre_ids.cs.[${id}]`)
      .join(',');
    filtered = filtered.or(orConditions);
  }

  if (filters.watchProviderIds.length > 0) {
    // 形態の指定が無ければ全形態を対象にする（どれかで観られれば該当）
    const offerTypes =
      filters.watchProviderOfferTypes.length > 0
        ? filters.watchProviderOfferTypes
        : WATCH_PROVIDER_OFFER_TYPES;

    // 「プロバイダー × 形態」の組み合わせをすべて OR で繋ぐ。
    // 形態ごとに列を分けているため、ジャンルと同じ containment で絞れる
    const orConditions = offerTypes
      .flatMap((offerType) =>
        filters.watchProviderIds.map(
          (id) => `watch_provider_${offerType}.cs.[${id}]`,
        ),
      )
      .join(',');
    filtered = filtered.or(orConditions);
  }

  return filtered as T;
}
