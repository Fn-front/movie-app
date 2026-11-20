/**
 * @jest-environment node
 */

/**
 * 分割削除ループのテスト
 *
 * SQL の削除条件そのものは実DBでしか検証できないため、
 * `e2e/rateLimit/rateLimitsRetention.spec.ts` が担当する。
 * ここは「どの RPC を何の引数で呼ぶか」と「どこで止まるか」を固定する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DELETE_BATCH_SIZE,
  MAX_BATCHES,
  runBatchedDelete,
} from './batchedDelete';

const RPC = 'delete_expired_rate_limits';
const LABEL = 'rate_limits';
const RETENTION = 48;

/** 常に同じ件数を返すクライアント */
const createSupabase = (result: { data?: unknown; error?: unknown }) =>
  ({
    rpc: jest.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  }) as unknown as SupabaseClient;

/**
 * 呼び出しごとに異なる削除件数を返すクライアント
 *
 * ⚠️ ループのテストに**固定モックを使わないこと**（#1287 の教訓）。
 * 停止条件は `deleted === 0` なので、常に同じ件数を返すモックは
 * `MAX_BATCHES` まで回る。打ち切りパスのカバレッジが偶然埋まり、
 * 誰も assert していない状態になる。
 */
const createSupabaseSequence = (counts: number[]) =>
  ({
    rpc: jest.fn().mockImplementation(() => {
      const next = counts.shift() ?? 0;
      return Promise.resolve({ data: next, error: null });
    }),
  }) as unknown as SupabaseClient;

/** 十分先の締め切り（時間切れを踏まない） */
const farDeadline = () => Date.now() + 60_000;

const run = (supabase: SupabaseClient, deadlineAt = farDeadline()) =>
  runBatchedDelete(supabase, {
    rpc: RPC,
    retentionHours: RETENTION,
    label: LABEL,
    deadlineAt,
  });

describe('runBatchedDelete', () => {
  it('保持期間と1回あたりの上限を引数にして RPC を呼ぶ', async () => {
    const supabase = createSupabaseSequence([5, 0]);

    await run(supabase);

    expect(supabase.rpc).toHaveBeenCalledWith(RPC, {
      retention_hours: RETENTION,
      p_limit: DELETE_BATCH_SIZE,
    });
  });

  /**
   * ⚠️ 「上限未満＝消し切った」で止めてはいけない（#1342）
   *
   * 外側 DELETE の WHERE は `ctid IN (...)` だけで期限条件を再掲して
   * いないため、サブクエリ確定後に候補行が同時更新・削除されると
   * `ROW_COUNT` が上限未満になる。そこで止めると**滞留が残っていても
   * 終了する**（静かな打ち切り）。0件を見るまで続ける。
   */
  it('上限未満でも0件になるまで続ける', async () => {
    const supabase = createSupabaseSequence([499, 3, 0]);

    await expect(run(supabase)).resolves.toEqual({
      deleted: 502,
      completed: true,
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(3);
  });

  it('上限ちょうどが返る限り繰り返し、合計を返す', async () => {
    const supabase = createSupabaseSequence([
      DELETE_BATCH_SIZE,
      DELETE_BATCH_SIZE,
      0,
    ]);

    await expect(run(supabase)).resolves.toEqual({
      deleted: DELETE_BATCH_SIZE * 2,
      completed: true,
    });
  });

  it('0件なら繰り返さない', async () => {
    const supabase = createSupabase({ data: 0 });

    await expect(run(supabase)).resolves.toEqual({
      deleted: 0,
      completed: true,
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('締め切りを過ぎたら打ち切り、警告を出す', async () => {
    // 黙って打ち切らない。消し残し＝保持期間を超えた個人データが残っている
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // 既に過ぎている締め切りを渡す＝1回目の判定で打ち切り
    const supabase = createSupabase({ data: DELETE_BATCH_SIZE });

    const result = await run(supabase, Date.now() - 1);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: DELETE_BATCH_SIZE, completed: false });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('消し残しがあります'),
    );

    warn.mockRestore();
  });

  it('反復上限に達したら打ち切り、警告を出す', async () => {
    // 時間予算と MAX_BATCHES の二重で有界にしている。時間予算だけだと
    // 1回あたりが極端に速い場合に回り続けるので、回数側も固定する
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = createSupabase({ data: 1 });

    const result = await run(supabase);

    expect(supabase.rpc).toHaveBeenCalledTimes(MAX_BATCHES);
    expect(result).toEqual({ deleted: MAX_BATCHES, completed: false });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`反復上限（${MAX_BATCHES}回）`),
    );

    warn.mockRestore();
  });

  it('件数が数値で返らなければ completed:false で止める', async () => {
    // 「消し切った」側に倒すと、滞留があるのに完走として記録される
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = createSupabase({ data: null });

    await expect(run(supabase)).resolves.toEqual({
      deleted: 0,
      completed: false,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('削除件数が数値で返りませんでした'),
    );

    warn.mockRestore();
  });

  /**
   * ⚠️ 既に消した件数をメッセージに載せる（#1342）。
   *
   * 各 RPC は独立したトランザクションなので、N-1 バッチ分の削除は
   * **確定している**。件数を捨てると「何件消えたのか分からない失敗」になる。
   */
  it('RPC が失敗したら throw し、削除済み件数をメッセージに載せる', async () => {
    const supabase = {
      rpc: jest
        .fn()
        .mockResolvedValueOnce({ data: 7, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'boom' } }),
    } as unknown as SupabaseClient;

    await expect(run(supabase)).rejects.toThrow(/7件は削除済み/);
  });

  it('ラベルがメッセージに出る（対象を取り違えない）', async () => {
    const supabase = createSupabase({ data: null, error: { message: 'x' } });

    await expect(
      runBatchedDelete(supabase, {
        rpc: 'delete_expired_otp_codes',
        retentionHours: RETENTION,
        label: 'otp_codes',
        deadlineAt: farDeadline(),
      }),
    ).rejects.toThrow(/otp_codesの削除に失敗/);
  });
});
