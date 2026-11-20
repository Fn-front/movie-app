/**
 * レート制限レコードの保持期間切れ削除のテスト
 *
 * SQL の削除条件は `e2e/rateLimit/rateLimitsRetention.spec.ts` が実DBで検証する。
 * ここは「どの RPC を何の引数で呼ぶか」と「失敗を握りつぶさないか」を固定する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';

import {
  deleteExpiredRateLimits,
  MAX_BATCHES,
  TIME_BUDGET_MS,
} from './cleanupRateLimits';

/** 実装と揃える（#1330）。ここがずれるとループのテストが無意味になる */
const DELETE_BATCH_SIZE = 500;

const createSupabase = (result: { data?: unknown; error?: unknown }) =>
  ({
    rpc: jest.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  }) as unknown as SupabaseClient;

/** 呼び出しごとに異なる削除件数を返すクライアント */
const createSupabaseSequence = (counts: number[]) =>
  ({
    rpc: jest.fn().mockImplementation(() => {
      const next = counts.shift() ?? 0;
      return Promise.resolve({ data: next, error: null });
    }),
  }) as unknown as SupabaseClient;

describe('deleteExpiredRateLimits', () => {
  it('保持期間と1回あたりの上限を引数にして RPC を呼ぶ', async () => {
    // ⚠️ `createSupabase({ data: 5 })` のような固定モックを使わないこと。
    // 停止条件は `deleted === 0`（#1342）なので、常に 5 を返すと
    // MAX_BATCHES まで 200 回まわる。引数を1つ見たいだけのテストが
    // RPC を200回呼び、未モックの警告が CI のログに残る
    const supabase = createSupabaseSequence([5, 0]);

    await deleteExpiredRateLimits(supabase);

    expect(supabase.rpc).toHaveBeenCalledWith('delete_expired_rate_limits', {
      retention_hours: RATE_LIMIT_RETENTION_HOURS,
      p_limit: DELETE_BATCH_SIZE,
    });
  });

  /**
   * 分割削除（#1330）
   *
   * この RPC は PostgREST 経由なので `authenticator` の
   * `statement_timeout = 8s` が効く。一括 DELETE のままだと行が増えたときに
   * ロールバックして1行も消えず、翌日さらに悪化して自力で回復しない。
   */
  describe('分割削除', () => {
    /**
     * ⚠️ 「上限未満＝消し切った」で止めてはいけない（#1342）
     *
     * 外側 DELETE の WHERE は `ctid IN (...)` だけで期限条件を再掲して
     * いないため、サブクエリ確定後に候補行が同時更新・削除されると
     * `ROW_COUNT` が上限未満になる。そこで止めると**滞留が残っていても
     * 終了する**（静かな打ち切り）。0件を見るまで続ける。
     */
    it('上限未満でも0件になるまで続ける', async () => {
      const supabase = createSupabaseSequence([DELETE_BATCH_SIZE - 1, 3, 0]);

      const { deleted: total, completed } =
        await deleteExpiredRateLimits(supabase);

      // 499 で止めていたら 1回・499件になる
      expect(supabase.rpc).toHaveBeenCalledTimes(3);
      expect(total).toBe(DELETE_BATCH_SIZE - 1 + 3);
      expect(completed).toBe(true);
    });

    it('上限ちょうどが返る限り繰り返し、合計を返す', async () => {
      const supabase = createSupabaseSequence([
        DELETE_BATCH_SIZE,
        DELETE_BATCH_SIZE,
        7,
        0,
      ]);

      const { deleted: total } = await deleteExpiredRateLimits(supabase);

      expect(supabase.rpc).toHaveBeenCalledTimes(4);
      expect(total).toBe(DELETE_BATCH_SIZE * 2 + 7);
    });

    it('0件なら繰り返さない', async () => {
      const supabase = createSupabaseSequence([0]);

      await expect(deleteExpiredRateLimits(supabase)).resolves.toEqual({
        deleted: 0,
        completed: true,
      });
      expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });

    it('時間切れになったら打ち切り、警告を出す', async () => {
      // Vercel Function の maxDuration(60s) の内側で切り上げる。
      // 強制終了されると削除件数のログすら残らない
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const nowSpy = jest.spyOn(Date, 'now');
      // 開始時刻 → 1回目の判定で予算超過
      nowSpy.mockReturnValueOnce(0).mockReturnValue(999_999);

      // 常に上限ちょうどを返す＝放置すれば無限に回る
      const supabase = {
        rpc: jest
          .fn()
          .mockResolvedValue({ data: DELETE_BATCH_SIZE, error: null }),
      } as unknown as SupabaseClient;

      const { deleted: total, completed } =
        await deleteExpiredRateLimits(supabase);

      expect(supabase.rpc).toHaveBeenCalledTimes(1);
      expect(total).toBe(DELETE_BATCH_SIZE);
      // 呼び出し側が観測できるよう completed:false を返す（#1342）
      expect(completed).toBe(false);
      // 黙って打ち切らない。消し残し＝保持期間を超えた個人データが残っている
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('消し残しがあります'),
      );

      nowSpy.mockRestore();
      warn.mockRestore();
    });

    it('反復上限に達したら打ち切り、警告を出す', async () => {
      // 時間予算と MAX_BATCHES の二重で有界にしている。時間予算だけだと
      // 1回あたりが極端に速い場合に回り続けるので、回数側も固定する。
      //
      // ⚠️ このテストが無いと MAX_BATCHES 到達のカバレッジは
      // 「他のテストが固定モックで偶然200回まわっている」だけになり、
      // そのテストを直した瞬間に静かに落ちる（レビューで実測）
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // 常に1件返す＝0件に到達しないので回数側でしか止まらない
      const supabase = {
        rpc: jest.fn().mockResolvedValue({ data: 1, error: null }),
      } as unknown as SupabaseClient;

      const { deleted: total, completed } =
        await deleteExpiredRateLimits(supabase);

      expect(supabase.rpc).toHaveBeenCalledTimes(MAX_BATCHES);
      expect(total).toBe(MAX_BATCHES);
      expect(completed).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`反復上限（${MAX_BATCHES}回）`),
      );

      warn.mockRestore();
    });
  });

  it('保持期間は48時間（最長ウィンドウの24時間では足りない）', () => {
    expect(RATE_LIMIT_RETENTION_HOURS).toBe(48);
  });

  /**
   * 時間予算と maxDuration の関係を固定する（#1342）
   *
   * 予算の判定はループ**末尾**にあるため、最後の1回の所要時間は予算の外側。
   * `statement_timeout = 8s` が縛るのは SQL の実行時間だけで、コネクション
   * 取得待ちやネットワークは含まない。
   *
   * 値だけを固定するテストでは、後から予算を伸ばした人を止められない。
   * 両者の関係そのものを不変条件にする。
   */
  it('時間予算は maxDuration から statement_timeout ぶんの余裕を残している', () => {
    // 8s は authenticator ロールの statement_timeout（本番で実測）
    const STATEMENT_TIMEOUT_MS = 8_000;

    // ⚠️ route.ts を import しない。jsdom 環境には `Request` が無く
    //   `ReferenceError: Request is not defined` でスイートごと落ちる。
    //   ソースから読み取って、値がずれたらここが落ちるようにする
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');

    const routeSource = fs.readFileSync(
      path.join(__dirname, '../../app/api/cron/cleanup-rate-limits/route.ts'),
      'utf8',
    );
    const matched = routeSource.match(/export const maxDuration = (\d+)/);

    // 読み取りが壊れていたら気づけるようにする（undefined なら常に通る比較を避ける）
    expect(matched).not.toBeNull();

    const maxDurationMs = Number(matched![1]) * 1000;

    expect(TIME_BUDGET_MS + STATEMENT_TIMEOUT_MS).toBeLessThan(maxDurationMs);
  });

  /**
   * 本 Issue（#933）の中心的な設計判断を守る不変条件
   *
   * 保持期間がどれかのレート制限ウィンドウより短いと、**カウント中の行が
   * 消えて制限が無言で弱くなる**。定数の値だけを固定するテストでは、
   * あとからウィンドウを伸ばした人を止められない。
   *
   * `src/constants/` を走査して集めるのは、`passwordReset.ts` と
   * `adminAccount.ts` が `constants/index.ts` から再エクスポートされて
   * おらず、index 経由では取りこぼすため（新しい設定ファイルが増えても
   * 自動で対象になる）。
   */
  describe('保持期間の不変条件', () => {
    /** レート制限のウィンドウ長（分）を `src/constants/` 全体から集める */
    const collectWindowMinutes = (): { path: string; minutes: number }[] => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');

      const dir = path.join(__dirname, '../../constants');
      const found: { path: string; minutes: number }[] = [];

      const walk = (value: unknown, trail: string, depth: number): void => {
        if (depth > 4 || value === null || typeof value !== 'object') return;

        for (const [key, child] of Object.entries(
          value as Record<string, unknown>,
        )) {
          const next = trail ? `${trail}.${key}` : key;

          if (typeof child === 'number') {
            if (key === 'windowMinutes' || key.endsWith('_WINDOW_MINUTES')) {
              found.push({ path: next, minutes: child });
            } else if (key.endsWith('_COOLDOWN_SECONDS')) {
              // クールダウンも last_attempt_at を見るので同じ土俵で比べる
              found.push({ path: next, minutes: child / 60 });
            }
            continue;
          }

          walk(child, next, depth + 1);
        }
      };

      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.ts') || file.includes('.test.')) continue;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        walk(require(path.join(dir, file)), file.replace('.ts', ''), 0);
      }

      return found;
    };

    it('保持期間は、すべてのレート制限ウィンドウより長い', () => {
      const windows = collectWindowMinutes();

      // 収集そのものが壊れていないことの確認（0件なら常に通ってしまう）
      expect(windows.length).toBeGreaterThan(10);

      const longest = windows.reduce((a, b) => (b.minutes > a.minutes ? b : a));

      expect(longest.minutes).toBeLessThan(RATE_LIMIT_RETENTION_HOURS * 60);
    });

    it('最長ウィンドウは OTP の日次送信上限（24時間）', () => {
      const windows = collectWindowMinutes();
      const longest = windows.reduce((a, b) => (b.minutes > a.minutes ? b : a));

      // ここが落ちたら、より長いウィンドウが追加されたということ。
      // RATE_LIMIT_RETENTION_HOURS がそれを上回っているか確認し、
      // `/privacy` と database-schema.md の記述も揃えること
      // index.ts が再エクスポートしているため、どのファイル経由で見つかるかは
      // 走査順に依存する。定数名だけで突き合わせる
      expect(longest.path).toContain('OTP_CONFIG.DAILY_SEND_WINDOW_MINUTES');
      expect(longest.minutes).toBe(1440);
    });
  });

  it('削除件数を返す', async () => {
    // 0 を返すまで続ける仕様（#1342）なので、2回目に 0 を返させる
    const supabase = createSupabaseSequence([42, 0]);

    await expect(deleteExpiredRateLimits(supabase)).resolves.toEqual({
      deleted: 42,
      completed: true,
    });
  });

  it('件数が数値で返らなければ completed:false で止める', async () => {
    // 「消し切った」側に倒すと、滞留があるのに完走として記録される。
    // `completed` は消し残しを観測するための値なので、分からないときは false
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = createSupabase({ data: null });

    await expect(deleteExpiredRateLimits(supabase)).resolves.toEqual({
      deleted: 0,
      completed: false,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('削除件数が数値で返りませんでした'),
    );

    warn.mockRestore();
  });

  it('RPC が失敗したら throw する（握りつぶさない）', async () => {
    const supabase = createSupabase({
      error: { message: 'permission denied' },
    });

    // 個人データの消去そのものなので、失敗を0件成功に見せてはいけない
    await expect(deleteExpiredRateLimits(supabase)).rejects.toThrow(
      'permission denied',
    );
  });
});
