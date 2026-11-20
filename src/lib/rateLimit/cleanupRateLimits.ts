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
 *
 * ⚠️ 判定はループ末尾にあるため、**最後の1回の所要時間は予算の外側**。
 * `statement_timeout = 8s` が縛るのは SQL の実行時間だけで、コネクション
 * 取得待ちやネットワークは含まない。45秒だと `maxDuration` まで15秒しか
 * 余裕が無かったので 35秒へ下げた（8秒 + 余裕を見込む）。
 *
 * この関係は `cleanupRateLimits.test.ts` の不変条件テストで固定している。
 */
export const TIME_BUDGET_MS = 35_000;

/**
 * 反復回数の上限（暴走の保険）
 *
 * 停止性は「候補集合が毎回厳密に縮む」ことで保証できるが、`fetchAllPages`
 * （`src/helpers/fetchAllPages.ts`）が `maxPages` を保険として持っているのと
 * 同じ作法に揃える。壁時計だけを頼りにしない。
 *
 * 500件 × 200回 = 10万件。これを超える滞留は掃除の問題ではないので、
 * ここで止めて警告を出すほうが気づける。
 */
export const MAX_BATCHES = 200;

/** 保持期間切れ削除の結果 */
export interface DeleteExpiredRateLimitsResult {
  /** 実際に削除した件数の合計 */
  deleted: number;
  /**
   * 消し切ったかどうか。
   *
   * `false` は「保持期間を超えた個人データがまだ残っている」状態。
   * 呼び出し側（CRON）はこれをレスポンスに載せて観測できるようにする。
   */
  completed: boolean;
}

/**
 * 保持期間を過ぎたレート制限レコードを削除する
 *
 * 1回も消せなくなるまで繰り返す。
 *
 * ⚠️ ループは**クライアント側**に置くこと。plpgsql の中でループしても
 * `statement_timeout` は RPC 全体に掛かるため分割にならない。
 *
 * @param supabase - service role クライアント（RPC は service_role にのみ付与）
 * @returns 削除件数と、消し切ったかどうか
 * @throws RPC が失敗した場合
 */
export async function deleteExpiredRateLimits(
  supabase: SupabaseClient,
): Promise<DeleteExpiredRateLimitsResult> {
  const startedAt = Date.now();
  let total = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { data, error } = await supabase.rpc('delete_expired_rate_limits', {
      retention_hours: RATE_LIMIT_RETENTION_HOURS,
      p_limit: DELETE_BATCH_SIZE,
    });

    // 握りつぶさない。これは個人データの消去そのもので、失敗したまま
    // 成功扱いにすると「消えているつもりで消えていない」状態に気づけない
    // （`deleteExpiredRecommendationEvents` が握りつぶしているのは、あちらが
    // レコメンド生成の副次処理で、落とすと本処理まで失敗扱いになるため）
    //
    // ⚠️ 既に消した件数を本文に載せる（#1342）。各 RPC は独立した
    // トランザクションなので、N-1 バッチ分の削除は**確定している**。
    // 件数を捨てると「何件消えたのか分からない失敗」になる
    if (error) {
      throw new Error(
        `レート制限レコードの削除に失敗しました（${total}件は削除済み）: ${error.message}`,
      );
    }

    // ⚠️ 想定外のレスポンス形は「消し切った」側に倒さない。
    //   RPC は `RETURNS INTEGER` なので実際には起きにくいが、起きたときに
    //   `completed: true` を返すと**滞留があるのに完走として記録される**。
    //   `completed` の目的は消し残しの観測なので、分からないときは false。
    if (typeof data !== 'number') {
      console.warn(
        `[cleanupRateLimits] 削除件数が数値で返りませんでした（${total}件削除）。消し残しの有無は判定できません`,
      );
      return { deleted: total, completed: false };
    }

    const deleted = data;
    total += deleted;

    // ⚠️ `deleted < DELETE_BATCH_SIZE` で打ち切らないこと（#1342）。
    //   外側 DELETE の WHERE は `ctid IN (...)` だけで期限条件を再掲して
    //   いないため、サブクエリ確定後に候補行が同時更新・削除されると
    //   （`consume_rate_limit` の upsert / `resetRateLimit`）その行は
    //   再検査に落ち、`ROW_COUNT` が 499 などになる。
    //   「上限未満＝消し切った」と見なすと、**滞留が残っていても終了する**。
    //   #1317 が `fetchAllPages` について明文化した
    //   「要求より少ない＝最終ページ と誤認する」のと同じ構図。
    if (deleted === 0) {
      return { deleted: total, completed: true };
    }

    // 時間切れ。**黙って打ち切らない**。消し残しがあること自体が
    // 「保持期間を超えた個人データが残っている」状態なので、気づけるようにする
    if (Date.now() - startedAt >= TIME_BUDGET_MS) {
      console.warn(
        `[cleanupRateLimits] 時間切れで打ち切りました（${total}件削除）。` +
          '消し残しがあります。翌日のCRONが続きを消しますが、毎日これが出るなら' +
          '行の増加ペースが掃除を追い越しています',
      );
      return { deleted: total, completed: false };
    }
  }

  console.warn(
    `[cleanupRateLimits] 反復上限（${MAX_BATCHES}回）に達しました（${total}件削除）。` +
      '滞留が大きすぎます。行の増加経路を疑ってください',
  );

  return { deleted: total, completed: false };
}
