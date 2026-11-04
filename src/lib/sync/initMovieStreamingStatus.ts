/**
 * ウォッチリスト追加時に、その作品の配信状況を初期化する
 *
 * 配信バッジの元データ（movie_streaming_status）を作るのは日次 Cron
 * （/api/cron/sync-watchlist-streaming・20:00 JST）だけだったため、
 * 追加した時点ですでに日本で配信中の作品でも、最長で約24時間バッジが
 * 出なかった（#942）。追加の経路でも1回だけ埋める。
 *
 * 行の組み立ては Cron と同じ buildStreamingStatusRow に通す。
 * 両方で別々に組むと、初配信・再配信の判定や列の対応づけが静かにずれるため。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildStreamingStatusRow } from '@/lib/sync/buildStreamingStatusRow';
import { getJpStreamingAvailability } from '@/lib/tmdb/tmdb';
import type { JpStreamingAvailability } from '@/lib/tmdb/tmdb';

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
 * `previous` を両方 null で渡すため、Cron がその作品を初めて
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

  let availability: JpStreamingAvailability;
  try {
    availability = await getJpStreamingAvailability(tmdbMovieId);
  } catch (error) {
    console.error(
      `[watchlist-streaming-init] availability ${tmdbMovieId}:`,
      error instanceof Error ? error.message : 'Unknown error',
    );
    return 'failed';
  }

  // 保存済みの状態は無い（上で行が無いことを確認済み）ので previous は両方 null
  const row = buildStreamingStatusRow(
    tmdbMovieId,
    { flatrate: null, paid: null },
    availability.watchProviderIds,
    now,
  );

  // 配信が無くても行は作る。「確認済みで配信なし」を残しておけば、
  // 同じ作品を別のユーザーが追加したときに TMDb を引き直さずに済む。
  //
  // ignoreDuplicates を付けて ON CONFLICT DO NOTHING にする。既定の
  // merge-duplicates だと、上の SELECT とこの書き込みの間に Cron や
  // 他リクエストが作った行を黙って上書きしてしまう。
  // この関数の役目は「無ければ作る」だけなので、競合したら何もしないのが正しい
  const { error: upsertError } = await supabase
    .from('movie_streaming_status')
    .upsert(row, { onConflict: 'tmdb_movie_id', ignoreDuplicates: true });

  if (upsertError) {
    console.error(
      `[watchlist-streaming-init] upsert ${tmdbMovieId}:`,
      upsertError.message,
    );
    return 'failed';
  }

  return 'initialized';
}
