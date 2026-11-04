/**
 * 受賞作品の旧世代削除
 *
 * cron（`syncSingleAward`）と手動同期（`executeManualAwardSync`）の両方から使う。
 * `syncAwardMoviesService` に置くと、同モジュールをまるごとモックしている
 * 手動同期のテストから実体を検証できなくなるため独立させている。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AwardMovieRow } from './syncAwardMoviesService';

export interface DeleteStaleAwardRowsParams {
  awardName: string;
  year: number;
  /** 今回の同期で書き込んだ `generated_at`。これより古い行が削除対象 */
  generatedAt: string;
  /** 今回 UPSERT した行。ここに現れた部門だけを削除対象にする */
  rows: AwardMovieRow[];
}

/**
 * 前回あって今回無い行（旧世代）を消す
 *
 * **必ず UPSERT のあとに呼ぶこと。** supabase-js の DELETE と UPSERT は別々の文で
 * それぞれ自動コミットされるため、先に消すと UPSERT 失敗時にデータが戻らない。
 * UPSERT 済みの行は `generated_at` が今回の値になっているので残る。
 *
 * **削除対象は今回取得できた部門だけに絞る。** 「取得0件なら書き込まない」という
 * 呼び出し元のガードは*部分*取得を防げない。`fetchEigaOscarAwards` は取得に失敗した
 * ページを飛ばして残りを返すため、一部の部門だけ0件でも全体は0件にならず、
 * ガードをすり抜ける。そこで賞・年まるごと消すと、取得できなかった部門の
 * 既存行が丸ごと失われる（cron は無人・月次なので気づく機会も無い）。
 *
 * @returns 失敗したときだけエラーメッセージを返す。成功時は null
 */
export async function deleteStaleAwardRows(
  supabase: SupabaseClient,
  params: DeleteStaleAwardRowsParams,
): Promise<{ message: string } | null> {
  const categories = [...new Set(params.rows.map((r) => r.category))];

  // 呼び出し元が0件で来ないことを保証しているが、万一来ても何も消さない
  if (categories.length === 0) return null;

  const { error } = await supabase
    .from('award_movies')
    .delete()
    .eq('award_name', params.awardName)
    .eq('award_year', params.year)
    .in('category', categories)
    .lt('generated_at', params.generatedAt);

  return error ? { message: error.message } : null;
}
