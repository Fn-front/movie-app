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
  /** 原因の手がかり。メール本文に入る */
  detail?: string;
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
  { cronName, attempted, failed, detail }: FailureRateNotice,
): Promise<boolean> {
  // 対象が無い実行は失敗ではない。
  //
  // ⚠️ ここを通すと 0/0 が NaN になり、比較が常に false になって
  // 「たまたま動いている」状態になる。明示的に弾く
  if (attempted <= 0 || failed <= 0) return false;

  const rate = failed / attempted;

  if (rate < CRON_FAILURE_RATE_THRESHOLD) return false;

  const percent = Math.round(rate * 100);

  return notifyCronFailure(supabase, {
    cronName,
    reason:
      `${attempted}件中 ${failed}件が失敗しました（${percent}%）` +
      (detail ? `\n${detail}` : ''),
  });
}
