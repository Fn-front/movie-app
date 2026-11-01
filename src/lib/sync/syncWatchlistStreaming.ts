/**
 * ウォッチリストの未視聴作品について、日本での配信状況を同期する
 *
 * movie_cache の配信情報は TMDb Discover 由来で、人気度と公開日ウィンドウで
 * 絞られている。実測ではウォッチリストの未視聴26件のうち movie_cache で
 * 配信状況が分かるのは1件だけだったため、ウォッチリストの作品は
 * 直接 TMDb に問い合わせる。
 *
 * 状態遷移（初配信 / 継続 / 一時的な欠落 / 再配信）の判定は
 * resolveStreamingOffer に切り出してある。
 */

import { createClient } from '@supabase/supabase-js';

import { TMDB_AVAILABILITY_CONCURRENCY } from '@/constants/tmdb';
import { getJpStreamingAvailability } from '@/lib/tmdb/tmdb';
import {
  resolveStreamingOffer,
  type StreamingOfferState,
} from '@/lib/sync/resolveStreamingStatus';

/**
 * 同期結果
 */
export interface WatchlistStreamingSyncResult {
  /** 問い合わせ対象のユニーク映画数 */
  targets: number;
  /** 更新に成功した映画数 */
  updated: number;
  /** 今回新たに配信を確認した映画数 */
  newlyAvailable: number;
  /** TMDb 問い合わせに失敗した映画数 */
  failed: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** エラーメッセージ */
  errors: string[];
}

/** movie_streaming_status の1行 */
interface StatusRow {
  tmdb_movie_id: number;
  flatrate_provider_ids: number[];
  paid_provider_ids: number[];
  flatrate_since: string | null;
  paid_since: string | null;
  flatrate_last_seen_at: string | null;
  paid_last_seen_at: string | null;
  flatrate_resumed: boolean;
  paid_resumed: boolean;
}

/**
 * 配列を指定サイズのチャンクに分割する
 */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * 保存済み行を、形態ごとの状態に分解する
 */
function toOfferStates(row: StatusRow | undefined): {
  flatrate: StreamingOfferState | null;
  paid: StreamingOfferState | null;
} {
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

/**
 * ウォッチリストの未視聴作品の配信状況を同期する
 *
 * @returns 同期結果（メトリクス込み）
 */
export async function syncWatchlistStreaming(): Promise<WatchlistStreamingSyncResult> {
  const startedAt = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: WatchlistStreamingSyncResult = {
    targets: 0,
    updated: 0,
    newlyAvailable: 0,
    failed: 0,
    durationMs: 0,
    errors: [],
  };

  // 全ユーザーの未視聴作品を集める。同じ映画は1回だけ問い合わせる
  const { data: watchlistRows, error: watchlistError } = await supabase
    .from('watchlist')
    .select('tmdb_movie_id')
    .is('deleted_at', null)
    .is('watched_at', null);

  if (watchlistError) {
    throw watchlistError;
  }

  const movieIds = [
    ...new Set((watchlistRows ?? []).map((row) => row.tmdb_movie_id)),
  ];
  result.targets = movieIds.length;

  if (movieIds.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // 保存済みの状態をまとめて引く
  const { data: statusRows, error: statusError } = await supabase
    .from('movie_streaming_status')
    .select('*')
    .in('tmdb_movie_id', movieIds);

  if (statusError) {
    throw statusError;
  }

  const statusById = new Map<number, StatusRow>(
    ((statusRows ?? []) as StatusRow[]).map((row) => [row.tmdb_movie_id, row]),
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const rowsToUpsert: Record<string, unknown>[] = [];

  // TMDb のレート制限（50 req/s）に収めるため、同時実行数を絞って順に流す
  for (const batch of chunk(movieIds, TMDB_AVAILABILITY_CONCURRENCY)) {
    const settled = await Promise.all(
      batch.map(async (movieId) => {
        try {
          const availability = await getJpStreamingAvailability(movieId);
          return { movieId, availability, error: null as string | null };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          return { movieId, availability: null, error: message };
        }
      }),
    );

    for (const { movieId, availability, error } of settled) {
      // 問い合わせに失敗した作品は更新しない。
      // 空に倒すと TMDb の一時障害だけで全作品が「配信終了」扱いになる
      if (!availability) {
        result.failed++;
        result.errors.push(`availability ${movieId}: ${error}`);
        continue;
      }

      const previous = toOfferStates(statusById.get(movieId));

      // rent と buy は UI 上どちらも「レンタル」で足りるためまとめる
      const paidIds = [
        ...new Set([
          ...availability.watchProviderIds.rent,
          ...availability.watchProviderIds.buy,
        ]),
      ];

      const flatrate = resolveStreamingOffer(
        previous.flatrate,
        availability.watchProviderIds.flatrate,
        now,
      );
      const paid = resolveStreamingOffer(previous.paid, paidIds, now);

      const wasAvailable =
        (previous.flatrate?.providerIds.length ?? 0) > 0 ||
        (previous.paid?.providerIds.length ?? 0) > 0;
      const isAvailable =
        flatrate.providerIds.length > 0 || paid.providerIds.length > 0;

      if (!wasAvailable && isAvailable) {
        result.newlyAvailable++;
      }

      rowsToUpsert.push({
        tmdb_movie_id: movieId,
        flatrate_provider_ids: flatrate.providerIds,
        paid_provider_ids: paid.providerIds,
        flatrate_since: flatrate.since,
        paid_since: paid.since,
        flatrate_last_seen_at: flatrate.lastSeenAt,
        paid_last_seen_at: paid.lastSeenAt,
        flatrate_resumed: flatrate.resumed,
        paid_resumed: paid.resumed,
        checked_at: nowIso,
      });
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('movie_streaming_status')
      .upsert(rowsToUpsert, { onConflict: 'tmdb_movie_id' });

    if (upsertError) {
      result.errors.push(`upsert: ${upsertError.message}`);
    } else {
      result.updated = rowsToUpsert.length;
    }
  }

  result.durationMs = Date.now() - startedAt;

  console.log(
    `[sync-watchlist-streaming] targets=${result.targets} ` +
      `updated=${result.updated} newlyAvailable=${result.newlyAvailable} ` +
      `failed=${result.failed} durationMs=${result.durationMs} ` +
      `errors=${result.errors.length}`,
  );

  return result;
}
