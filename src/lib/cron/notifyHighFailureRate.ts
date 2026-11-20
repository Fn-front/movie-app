/**
 * 「ほぼ全滅」した CRON を通知する（#1354）
 *
 * 同期系サービスは作品ごと・利用者ごとに catch して処理を続ける。1件の失敗で
 * 全体を止めない設計は妥当だが、**全件失敗しても 200 / `success: true`** で
 * 返るため、#1353 で入れた失敗通知にも Vercel のステータス監視にも現れない。
 *
 * ⚠️ **レスポンスのステータスは変えない。** 部分的には成功しているので、
 * `cleanup-expired-records` の `hasError`（＝設定の問題で次回も直らない）
 * とは性質が違う。500 にすると Vercel の再試行とも噛み合わない。
 * 変えるのは「人に届くかどうか」だけ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { CRON_FAILURE_RATE_THRESHOLD } from '@/constants/cron';

import { notifyCronFailure } from './notifyCronFailure';

/** 1回の実行の集計 */
export interface FailureRateNotice {
  /** CRON の名前。連投抑止の識別子に使う */
  cronName: string;
  /**
   * 処理しようとした件数
   *
   * ⚠️ **「取得した件数」ではなく「失敗しうる処理に通した件数」**を渡すこと。
   * 分母に除外済みの件数まで含めると失敗率が薄まり、全滅を見逃す。
   */
  attempted: number;
  /**
   * そのうち失敗した件数
   *
   * ⚠️ **「スキップ」を混ぜないこと。** 対象外だったものと失敗したものを
   * 一緒に数えると、正常な実行で通知が出る。
   */
  failed: number;
  /**
   * 全体のエラー件数（作品単位でないものを含む）
   *
   * ⚠️ **`attempted === 0` のときだけ見る。** 取得段階で全滅すると
   * 作品単位の処理へ1件も進まないため `attempted` が 0 になり、
   * 失敗率では表現できない。それでも 200 / `success: true` で返るので
   * 誰にも届かない（#1354 のレビューで実測）。
   *
   * 実際に当たるのは `syncStreamingMovies` だけ。あちらは discover の
   * 例外を time_frame 単位で catch して続行する。他の同期は取得段階の
   * 例外がそのまま上がるので 500 → `handleCronError` の通知に乗る。
   */
  errorCount?: number;
  /** 原因の手がかり。メール本文に入る */
  detail?: string;
}

/** 件数とパーセントの行 */
function formatRate(attempted: number, failed: number): string {
  return `${attempted}件中 ${failed}件が失敗しました（${Math.round(
    (failed / attempted) * 100,
  )}%）`;
}

/**
 * 失敗率がしきい値を超えていたら通知する
 *
 * ⚠️ `notifyCronFailure` と同じく **throw しない**。呼び出し側は既に
 * レスポンスを決めた後に呼ぶ。
 *
 * @param supabase - service role クライアント。null なら連投抑止を諦めて送る
 * @param notice - 集計
 * @returns 通知を送ったかどうか（送らなかった場合も false）
 */
export async function notifyIfMostlyFailed(
  supabase: SupabaseClient | null,
  { cronName, attempted, failed, errorCount, detail }: FailureRateNotice,
): Promise<boolean> {
  // ⚠️ 1件も処理に入れなかったとき。
  //
  //   エラーが無ければ単に対象が無い日なので何もしない。エラーがあるなら
  //   **取得段階で全滅している**ので、失敗率を計算できなくても通知する。
  //   ここを素通りさせると「最悪のケースだけが黙る」ことになる。
  //
  //   0 で割らないよう、率の計算より前に分ける
  if (attempted <= 0) {
    if (!errorCount) return false;

    return notifyCronFailure(supabase, {
      cronName,
      reason:
        `処理対象を1件も取得できませんでした（エラー ${errorCount}件）` +
        (detail ? `\n${detail}` : ''),
    });
  }

  // ⚠️ `failed <= 0` を別に弾かない。率が 0 になってしきい値を下回るので
  //    同じ結果になり、**条件が2つあると片方が死んでいても気づけない**
  if (failed / attempted < CRON_FAILURE_RATE_THRESHOLD) return false;

  return notifyCronFailure(supabase, {
    cronName,
    reason: formatRate(attempted, failed) + (detail ? `\n${detail}` : ''),
  });
}
