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

import {
  buildStreamingStatusRow,
  toOfferStates,
} from '@/lib/sync/buildStreamingStatusRow';
import { getJpStreamingAvailability } from '@/lib/tmdb/tmdb';
import type { JpStreamingAvailability } from '@/lib/tmdb/tmdb';
import { STREAMING_STATUS_FRESH_MS } from '@/constants/watchlist';

/**
 * 保存済み行がまだ新しいか判定する
 *
 * @param checkedAt - 行の `checked_at`
 * @param now - 現在時刻
 * @returns 新しければ true（引き直さない）
 */
function isFresh(checkedAt: string | null, now: Date): boolean {
  if (!checkedAt) return false;

  const checked = Date.parse(checkedAt);
  // パースできない値は古い扱いにして引き直す（放置して陳腐化させるより安全）
  if (Number.isNaN(checked)) return false;

  return now.getTime() - checked < STREAMING_STATUS_FRESH_MS;
}

/**
 * 初期化の結果
 *
 * - `initialized`: TMDb に問い合わせて行を作った、または古い行を引き直した
 * - `skipped`: 新しい行がすでにある（他ユーザーが先に追加済み）ので何もしない
 * - `failed`: 問い合わせか保存に失敗した。追加自体は成功させ、翌日の Cron に任せる
 */
export type StreamingStatusInitOutcome = 'initialized' | 'skipped' | 'failed';

/**
 * 配信状況の行が無い、または古ければ TMDb に1回問い合わせて作り直す
 *
 * `movie_streaming_status` は作品単位の共有テーブルなので、同じ作品を誰かが
 * 先に追加していれば行がある。ただし**新しい行のときだけ**問い合わせを省く。
 * 行の有無だけで判断していた頃は、古い行が残る作品で配信バッジの遅延が
 * 再発していた（#960）。
 *
 * **`since`（配信開始を検知した時刻）の扱いは経路で分かれる。**
 *
 * - 行が無い: `previous` が両方 null になるため、Cron がその作品を初めて
 *   取り込んだときと同じ扱い。追加時点ですでに配信中だった作品も
 *   配信優先ソート（#899）の先頭グループに入る（#942）
 * - 古い行がある: 既存の状態を `previous` に渡すので `since` は引き継がれる。
 *   ずっと配信中だった作品が「いま検知した」扱いで浮上することはない
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
    .select(
      'tmdb_movie_id, checked_at, flatrate_provider_ids, paid_provider_ids, flatrate_since, paid_since, flatrate_last_seen_at, paid_last_seen_at, flatrate_resumed, paid_resumed',
    )
    .eq('tmdb_movie_id', tmdbMovieId)
    .maybeSingle();

  if (selectError) {
    console.error(
      `[watchlist-streaming-init] select ${tmdbMovieId}:`,
      selectError.message,
    );
    return 'failed';
  }

  // 行の**有無**ではなく新しさで判断する（#960）。
  //
  // このテーブルは作品単位の共有だが、日次Cron が更新するのは「誰かの
  // ウォッチリストにあって未視聴」の作品だけ。全員が視聴済みにすると以後
  // 更新されず、取り残される期間に上限が無い。その間に配信が始まると、
  // 行があるせいで引き直されず #942 と同じ症状が再発していた
  if (existing && isFresh(existing.checked_at, now)) return 'skipped';

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

  // 古い行がある場合はその状態を前回値として渡す。両方 null で渡すと
  // `since` / `last_seen_at` の履歴が失われ、ずっと配信中だった作品まで
  // 「いま検知した」扱いになって配信優先ソートの先頭に割り込む。
  //
  // ただし**再配信の判定は抑止する**（第5引数 false）。その判定は
  // 「毎日観測していて、それでも7日見えなかった」ことを根拠にしているが、
  // ここへ来る行は7日以上まったく観測されていない。ギャップは「終了した」
  // ではなく「見ていなかった」を意味する。
  //
  // 抑止しないと、引き直しのしきい値（STREAMING_STATUS_FRESH_MS = 7日）と
  // STREAMING_RESUME_THRESHOLD_DAYS（7日）が同値であることから、
  // **この経路では再配信判定が構造的に必ず成立**してしまう
  const row = buildStreamingStatusRow(
    tmdbMovieId,
    toOfferStates(existing),
    availability.watchProviderIds,
    now,
    existing === null,
  );

  // 配信が無くても行は作る。「確認済みで配信なし」を残しておけば、
  // 同じ作品を別のユーザーが追加したときに TMDb を引き直さずに済む。
  //
  // 競合時の扱いは経路で分かれる。
  //
  // - **行が無かった**: `ignoreDuplicates` で ON CONFLICT DO NOTHING。
  //   上の SELECT とこの書き込みの間に Cron や他リクエストが作った行を
  //   黙って上書きしないため。この経路の役目は「無ければ作る」だけ
  // - **古い行があった**: 上書きする（#960）。引き直した結果を捨てては
  //   意味が無い。間に Cron が更新していた場合は、ほぼ同時刻の値で
  //   上書きすることになるが、どちらも今回の問い合わせ結果なので実害は無い
  const { error: upsertError } = await supabase
    .from('movie_streaming_status')
    .upsert(row, {
      onConflict: 'tmdb_movie_id',
      ignoreDuplicates: existing === null,
    });

  if (upsertError) {
    console.error(
      `[watchlist-streaming-init] upsert ${tmdbMovieId}:`,
      upsertError.message,
    );
    return 'failed';
  }

  return 'initialized';
}
