/**
 * movie_streaming_status の1行を組み立てる
 *
 * 書き手は日次Cron（syncWatchlistStreaming）とウォッチリスト追加
 * （initMovieStreamingStatus）の2つある。両方で別々に組むと、列を足したときに
 * 片方だけ更新される。列の対応づけはここに1箇所だけ置く。
 *
 * DB にも TMDb にも触らない純粋関数。
 */

import {
  resolveStreamingOffer,
  type StreamingOfferState,
} from '@/lib/sync/resolveStreamingStatus';

/** movie_streaming_status の1行（upsert に渡す形） */
export interface MovieStreamingStatusRow {
  tmdb_movie_id: number;
  flatrate_provider_ids: number[];
  paid_provider_ids: number[];
  flatrate_since: string | null;
  paid_since: string | null;
  flatrate_last_seen_at: string | null;
  paid_last_seen_at: string | null;
  flatrate_resumed: boolean;
  paid_resumed: boolean;
  checked_at: string;
}

/** 提供形態ごとの保存済み状態。未登録なら両方 null */
export interface PreviousOfferStates {
  flatrate: StreamingOfferState | null;
  paid: StreamingOfferState | null;
}

/** 保存済み行のうち、前回状態の復元に要る列 */
export interface StoredOfferRow {
  flatrate_provider_ids: number[] | null;
  paid_provider_ids: number[] | null;
  flatrate_since: string | null;
  paid_since: string | null;
  flatrate_last_seen_at: string | null;
  paid_last_seen_at: string | null;
  flatrate_resumed: boolean;
  paid_resumed: boolean;
}

/**
 * 保存済み行を `buildStreamingStatusRow` に渡せる形へ戻す
 *
 * 行↔状態の対応づけはこのファイルに集約する。書き手は日次Cron
 * （`syncWatchlistStreaming`）とウォッチリスト追加（`initMovieStreamingStatus`）の
 * 2つあり、別々に組むと列を足したときに片方だけ更新される。
 *
 * @param row - 保存済み行。未登録なら undefined
 * @returns 提供形態ごとの前回状態
 */
export function toOfferStates(
  row: StoredOfferRow | undefined | null,
): PreviousOfferStates {
  if (!row) return { flatrate: null, paid: null };

  return {
    flatrate: {
      providerIds: row.flatrate_provider_ids ?? [],
      since: row.flatrate_since,
      lastSeenAt: row.flatrate_last_seen_at,
      resumed: row.flatrate_resumed,
    },
    paid: {
      providerIds: row.paid_provider_ids ?? [],
      since: row.paid_since,
      lastSeenAt: row.paid_last_seen_at,
      resumed: row.paid_resumed,
    },
  };
}

/** TMDb が返した提供形態ごとのプロバイダーID（この関数が使う分だけ） */
export interface OfferProviderIds {
  flatrate: number[];
  rent: number[];
  buy: number[];
}

/**
 * 保存済みの状態と今回の問い合わせ結果から、保存すべき1行を作る
 *
 * rent と buy は paid にまとめる。実測で「購入のみ」は0件で、UI でも
 * 「レンタル」の一語で足りるため分けても表示に差が出ない。
 *
 * @param tmdbMovieId - 対象のTMDb映画ID
 * @param previous - 保存済みの状態。行が無ければ両方 null
 * @param providerIds - 今回確認できたプロバイダーID
 * @param now - 現在時刻
 * @param canDetectResume - 再配信を判定してよいか。既定 true。
 *   観測が途切れていた経路（古い行の引き直し）では false を渡す。
 *   詳細は `resolveStreamingOffer` のコメント
 * @returns upsert に渡す1行
 */
export function buildStreamingStatusRow(
  tmdbMovieId: number,
  previous: PreviousOfferStates,
  providerIds: OfferProviderIds,
  now: Date,
  canDetectResume: boolean = true,
): MovieStreamingStatusRow {
  const paidIds = [...new Set([...providerIds.rent, ...providerIds.buy])];

  const flatrate = resolveStreamingOffer(
    previous.flatrate,
    providerIds.flatrate,
    now,
    canDetectResume,
  );
  const paid = resolveStreamingOffer(
    previous.paid,
    paidIds,
    now,
    canDetectResume,
  );

  return {
    tmdb_movie_id: tmdbMovieId,
    flatrate_provider_ids: flatrate.providerIds,
    paid_provider_ids: paid.providerIds,
    flatrate_since: flatrate.since,
    paid_since: paid.since,
    flatrate_last_seen_at: flatrate.lastSeenAt,
    paid_last_seen_at: paid.lastSeenAt,
    flatrate_resumed: flatrate.resumed,
    paid_resumed: paid.resumed,
    checked_at: now.toISOString(),
  };
}
