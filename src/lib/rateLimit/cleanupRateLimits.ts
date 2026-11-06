/**
 * レート制限レコードの保持期間切れ削除（#933）
 *
 * `rate_limits.identifier` にはメールアドレス・IPアドレス・ユーザーIDが入る。
 * 成功時の個別削除（`resetRateLimit`）はあるが、失敗したまま放置された行は
 * ウィンドウを過ぎても残り続けていた。日次CRONから呼んで消す。
 *
 * 削除条件そのものは SQL 側（`delete_expired_rate_limits`）にある。
 * ここで `.lt()` を組み立てないのは、「ロック中の行を消さない」という条件を
 * PostgREST のクエリで表現すると読み手が意図を追えないため。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';

/**
 * 保持期間を過ぎたレート制限レコードを削除する
 *
 * @param supabase - service role クライアント（RPC は service_role にのみ付与）
 * @returns 削除件数
 * @throws RPC が失敗した場合
 */
export async function deleteExpiredRateLimits(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc('delete_expired_rate_limits', {
    retention_hours: RATE_LIMIT_RETENTION_HOURS,
  });

  // 握りつぶさない。これは個人データの消去そのもので、失敗したまま
  // 成功扱いにすると「消えているつもりで消えていない」状態に気づけない
  // （`deleteExpiredRecommendationEvents` が握りつぶしているのは、あちらが
  // レコメンド生成の副次処理で、落とすと本処理まで失敗扱いになるため）
  if (error) {
    throw new Error(`レート制限レコードの削除に失敗しました: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
}
