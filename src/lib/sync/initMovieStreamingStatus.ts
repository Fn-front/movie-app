/**
 * ウォッチリスト追加時に、その作品の配信状況を初期化する
 *
 * 配信バッジの元データ（movie_streaming_status）を作るのは日次 Cron
 * （/api/cron/sync-watchlist-streaming・20:00 JST）だけだったため、
 * 追加した時点ですでに日本で配信中の作品でも、最長で約24時間バッジが
 * 出なかった（#942）。追加の経路でも1回だけ埋める。
 *
 * 状態の組み立ては Cron と同じ resolveStreamingOffer に通す。
 * 両方で別々に組むと、初配信・再配信の判定が静かにずれるため。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveStreamingOffer } from '@/lib/sync/resolveStreamingStatus';
import { getJpStreamingAvailability } from '@/lib/tmdb/tmdb';

/**
 * 初期化の結果
 *
 * - `initialized`: TMDb に問い合わせて行を作った
 * - `skipped`: すでに行がある（他ユーザーが先に追加済み）ので何もしない
 * - `failed`: 問い合わせか保存に失敗した。追加自体は成功させ、翌日の Cron に任せる
 */
export type StreamingStatusInitOutcome = 'initialized' | 'skipped' | 'failed';

/**
 * 配信状況の行がまだ無ければ、TMDb に1回問い合わせて作る
 *
 * `movie_streaming_status` は作品単位の共有テーブルなので、同じ作品を誰かが
 * 先に追加していれば行がある。その場合は問い合わせない。
 *
 * **`since`（配信開始を検知した時刻）には追加時刻を入れる。**
 * `resolveStreamingOffer(null, ...)` に通すため、Cron がその作品を初めて
 * 取り込んだときとまったく同じ扱いになる。結果として、追加時点ですでに
 * 配信中だった作品も配信優先ソート（#899）の先頭グループに入る。
 * 「追加時点で配信中だったか」を区別するには列を増やす必要があり、
 * 本Issueでは分けない。
 *
 * 失敗しても例外は投げない。バッジが出ないだけで追加操作そのものが
 * 失敗する方が困るため。
 *
 * @param supabase - service role のクライアント
 * @param tmdbMovieId - 追加した作品のTMDb映画ID
 * @param now - 現在時刻（テスト用に差し替え可能）
 * @returns 何をしたか
 */
export async function initMovieStreamingStatus(
  supabase: SupabaseClient,
  tmdbMovieId: number,
  now: Date = new Date(),
): Promise<StreamingStatusInitOutcome> {
  const { data: existing, error: selectError } = await supabase
    .from('movie_streaming_status')
    .select('tmdb_movie_id')
    .eq('tmdb_movie_id', tmdbMovieId)
    .maybeSingle();

  if (selectError) {
    console.error(
      `[watchlist-streaming-init] select ${tmdbMovieId}:`,
      selectError.message,
    );
    return 'failed';
  }

  if (existing) return 'skipped';

  let availability;
  try {
    availability = await getJpStreamingAvailability(tmdbMovieId);
  } catch (error) {
    console.error(
      `[watchlist-streaming-init] availability ${tmdbMovieId}:`,
      error instanceof Error ? error.message : 'Unknown error',
    );
    return 'failed';
  }

  // rent と buy は UI 上どちらも「レンタル」で足りるためまとめる（Cron と同じ）
  const paidIds = [
    ...new Set([
      ...availability.watchProviderIds.rent,
      ...availability.watchProviderIds.buy,
    ]),
  ];

  // 保存済みの状態は無い（上で行が無いことを確認済み）ので previous は null
  const flatrate = resolveStreamingOffer(
    null,
    availability.watchProviderIds.flatrate,
    now,
  );
  const paid = resolveStreamingOffer(null, paidIds, now);

  // 配信が無くても行は作る。「確認済みで配信なし」を残しておけば、
  // 同じ作品を別のユーザーが追加したときに TMDb を引き直さずに済む
  const { error: upsertError } = await supabase
    .from('movie_streaming_status')
    .upsert(
      {
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
      },
      { onConflict: 'tmdb_movie_id' },
    );

  if (upsertError) {
    console.error(
      `[watchlist-streaming-init] upsert ${tmdbMovieId}:`,
      upsertError.message,
    );
    return 'failed';
  }

  return 'initialized';
}
