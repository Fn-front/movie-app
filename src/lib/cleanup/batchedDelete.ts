/**
 * 保持期間切れレコードの分割削除（#933 / #1330 / #1342 / #978 / #1300）
 *
 * `rate_limits` 用に書いたループを、`otp_codes` /
 * `password_reset_tokens` でも使えるように切り出したもの。
 *
 * ⚠️ ループは**クライアント側**に置くこと。plpgsql の中でループしても
 * `authenticator` の `statement_timeout = 8s` は RPC 全体に掛かるため
 * 分割にならない。一括 DELETE だと行が増えたとき全ロールバックして
 * **1行も消えず、翌日さらに悪化して自力で回復しない**。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 1回の RPC で消す上限（#1330）
 *
 * 大きすぎると `statement_timeout` に当たり、小さすぎると往復が増える。
 */
export const DELETE_BATCH_SIZE = 500;

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

/** 分割削除の結果 */
export interface BatchedDeleteResult {
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

/** 分割削除の指定 */
export interface BatchedDeleteOptions {
  /** 呼ぶ RPC 名。`(retention_hours, p_limit)` を取り、削除件数を返すこと */
  rpc: string;
  /** 保持期間（時間） */
  retentionHours: number;
  /** ログに出す名前。失敗時のメッセージにも使う */
  label: string;
  /**
   * この時刻を過ぎたら打ち切る（`Date.now()` と比較する絶対時刻）
   *
   * ⚠️ **呼び出し側が1つ作って全対象で共有すること。** 対象ごとに
   * 予算を持たせると、3対象 × 35秒 = 105秒 で Vercel Function の
   * `maxDuration`（60秒）を超え、強制終了されて削除件数のログすら残らない。
   */
  deadlineAt: number;
}

/**
 * 保持期間を過ぎたレコードを、1回も消せなくなるまで分割して削除する
 *
 * @param supabase - service role クライアント（RPC は service_role にのみ付与）
 * @param options - 対象の指定
 * @returns 削除件数と、消し切ったかどうか
 * @throws RPC が失敗した場合（既に削除した件数をメッセージに載せる）
 */
export async function runBatchedDelete(
  supabase: SupabaseClient,
  { rpc, retentionHours, label, deadlineAt }: BatchedDeleteOptions,
): Promise<BatchedDeleteResult> {
  let total = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { data, error } = await supabase.rpc(rpc, {
      retention_hours: retentionHours,
      p_limit: DELETE_BATCH_SIZE,
    });

    // 握りつぶさない。これは個人データの消去そのもので、失敗したまま
    // 成功扱いにすると「消えているつもりで消えていない」状態に気づけない。
    //
    // ⚠️ 既に消した件数をメッセージに載せる（#1342）。各 RPC は独立した
    // トランザクションなので、N-1 バッチ分の削除は**確定している**。
    // 件数を捨てると「何件消えたのか分からない失敗」になる
    if (error) {
      throw new Error(
        `${label}の削除に失敗しました（${total}件は削除済み）: ${error.message}`,
      );
    }

    // ⚠️ 想定外のレスポンス形は「消し切った」側に倒さない。
    //   RPC は `RETURNS INTEGER` なので実際には起きにくいが、起きたときに
    //   `completed: true` を返すと**滞留があるのに完走として記録される**。
    //   `completed` の目的は消し残しの観測なので、分からないときは false。
    if (typeof data !== 'number') {
      console.warn(
        `[${label}] 削除件数が数値で返りませんでした（${total}件削除）。消し残しの有無は判定できません`,
      );
      return { deleted: total, completed: false };
    }

    const deleted = data;
    total += deleted;

    // ⚠️ `deleted < DELETE_BATCH_SIZE` で打ち切らないこと（#1342）。
    //   外側 DELETE の WHERE は `ctid IN (...)` だけで期限条件を再掲して
    //   いないため、サブクエリ確定後に候補行が同時更新・削除されると
    //   その行は再検査に落ち、`ROW_COUNT` が 499 などになる。
    //   「上限未満＝消し切った」と見なすと、**滞留が残っていても終了する**。
    //   #1317 が `fetchAllPages` について明文化した
    //   「要求より少ない＝最終ページ と誤認する」のと同じ構図。
    if (deleted === 0) {
      return { deleted: total, completed: true };
    }

    // 時間切れ。**黙って打ち切らない**。消し残しがあること自体が
    // 「保持期間を超えた個人データが残っている」状態なので、気づけるようにする
    if (Date.now() >= deadlineAt) {
      console.warn(
        `[${label}] 時間切れで打ち切りました（${total}件削除）。` +
          '消し残しがあります。翌日のCRONが続きを消しますが、毎日これが出るなら' +
          '行の増加ペースが掃除を追い越しています',
      );
      return { deleted: total, completed: false };
    }
  }

  console.warn(
    `[${label}] 反復上限（${MAX_BATCHES}回）に達しました（${total}件削除）。` +
      '滞留が大きすぎます。行の増加経路を疑ってください',
  );

  return { deleted: total, completed: false };
}
