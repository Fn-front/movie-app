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
 * 1回の RPC で消す最大件数（#1330）
 *
 * この RPC は PostgREST 経由で呼ぶため `authenticator` ロールの
 * `statement_timeout = 8s` が効く。一括 DELETE のままだと、行が増えたときに
 * 8秒を超えて**トランザクションごとロールバック**し、1行も消えないまま翌日
 * さらに大きいテーブルを相手にすることになる。一度入ると自力で回復しない。
 *
 * 500件なら索引の更新を含めても 8秒には遠い。大きくしすぎると元の問題に戻る。
 */
const DELETE_BATCH_SIZE = 500;

/**
 * ループを打ち切る時間の目安（ミリ秒）
 *
 * 呼び出し元の Vercel Function は `maxDuration = 60`
 * （`src/app/api/cron/cleanup-rate-limits/route.ts`）。途中で強制終了されると
 * 削除件数のログすら残らないため、内側で切り上げて結果を返す。
 * 残りは翌日のCRONが続きから消す（消す順序に依存しない条件なので問題ない）。
 */
const TIME_BUDGET_MS = 45_000;

/**
 * 保持期間を過ぎたレート制限レコードを削除する
 *
 * 削除件数が上限に達する限り繰り返す。
 *
 * ⚠️ ループは**クライアント側**に置くこと。plpgsql の中でループしても
 * `statement_timeout` は RPC 全体に掛かるため分割にならない。
 *
 * @param supabase - service role クライアント（RPC は service_role にのみ付与）
 * @returns 削除件数の合計
 * @throws RPC が失敗した場合
 */
export async function deleteExpiredRateLimits(
  supabase: SupabaseClient,
): Promise<number> {
  const startedAt = Date.now();
  let total = 0;

  for (;;) {
    const { data, error } = await supabase.rpc('delete_expired_rate_limits', {
      retention_hours: RATE_LIMIT_RETENTION_HOURS,
      p_limit: DELETE_BATCH_SIZE,
    });

    // 握りつぶさない。これは個人データの消去そのもので、失敗したまま
    // 成功扱いにすると「消えているつもりで消えていない」状態に気づけない
    // （`deleteExpiredRecommendationEvents` が握りつぶしているのは、あちらが
    // レコメンド生成の副次処理で、落とすと本処理まで失敗扱いになるため）
    if (error) {
      throw new Error(
        `レート制限レコードの削除に失敗しました: ${error.message}`,
      );
    }

    const deleted = typeof data === 'number' ? data : 0;
    total += deleted;

    // 上限に満たなければ消し切っている
    if (deleted < DELETE_BATCH_SIZE) break;

    // 時間切れ。**黙って打ち切らない**。消し残しがあること自体が
    // 「保持期間を超えた個人データが残っている」状態なので、気づけるようにする
    if (Date.now() - startedAt >= TIME_BUDGET_MS) {
      console.warn(
        `[cleanupRateLimits] 時間切れで打ち切りました（${total}件削除）。` +
          '消し残しがあります。翌日のCRONが続きを消しますが、毎日これが出るなら' +
          '行の増加ペースが掃除を追い越しています',
      );
      break;
    }
  }

  return total;
}
