/**
 * 受賞作品の旧世代削除
 *
 * cron（`syncSingleAward`）と手動同期（`executeManualAwardSync`）の両方から使う。
 * `syncAwardMoviesService` に置くと、同モジュールをまるごとモックしている
 * 手動同期のテストから実体を検証できなくなるため独立させている。
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export interface DeleteStaleAwardRowsParams {
  awardName: string;
  year: number;
  /** 今回の同期で書き込んだ `generated_at`。これより古い行が削除対象 */
  generatedAt: string;
  /**
   * 削除してよい部門
   *
   * `fetchAndResolveAward` の `deletableCategories` をそのまま渡す。
   * 取りこぼしが出た部門は呼び出し元で除外済みであることが前提
   */
  categories: string[];
}

/**
 * 前回あって今回無い行（旧世代）を消す
 *
 * **必ず UPSERT のあとに呼ぶこと。** supabase-js の DELETE と UPSERT は別々の文で
 * それぞれ自動コミットされるため、先に消すと UPSERT 失敗時にデータが戻らない。
 * UPSERT 済みの行は `generated_at` が今回の値になっているので残る。
 *
 * **削除範囲は `categories` に閉じる。** 「取得0件なら書き込まない」という
 * 呼び出し元のガードは*部分*取得を防げない。賞・年まるごと消すと、取得できな
 * かった部門の既存行が丸ごと失われる（cron は無人・月次なので気づく機会も無い）。
 *
 * @returns 失敗したときだけ PostgrestError を返す。成功時は null
 */
export async function deleteStaleAwardRows(
  supabase: SupabaseClient,
  params: DeleteStaleAwardRowsParams,
): Promise<PostgrestError | null> {
  // 消してよい部門が1つも無いなら何もしない
  if (params.categories.length === 0) return null;

  const { error } = await supabase
    .from('award_movies')
    .delete()
    .eq('award_name', params.awardName)
    .eq('award_year', params.year)
    .in('category', params.categories)
    .lt('generated_at', params.generatedAt);

  return error;
}
