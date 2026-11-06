/**
 * レート制限レコードの保持期間切れ削除のテスト
 *
 * SQL の削除条件は `e2e/rateLimit/rateLimitsRetention.spec.ts` が実DBで検証する。
 * ここは「どの RPC を何の引数で呼ぶか」と「失敗を握りつぶさないか」を固定する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';

import { deleteExpiredRateLimits } from './cleanupRateLimits';

const createSupabase = (result: { data?: unknown; error?: unknown }) =>
  ({
    rpc: jest.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  }) as unknown as SupabaseClient;

describe('deleteExpiredRateLimits', () => {
  it('保持期間を引数にして RPC を呼ぶ', async () => {
    const supabase = createSupabase({ data: 5 });

    await deleteExpiredRateLimits(supabase);

    expect(supabase.rpc).toHaveBeenCalledWith('delete_expired_rate_limits', {
      retention_hours: RATE_LIMIT_RETENTION_HOURS,
    });
  });

  it('保持期間は48時間（最長ウィンドウの24時間では足りない）', () => {
    expect(RATE_LIMIT_RETENTION_HOURS).toBe(48);
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
    const supabase = createSupabase({ data: 42 });

    await expect(deleteExpiredRateLimits(supabase)).resolves.toBe(42);
  });

  it('件数が数値でなければ0として扱う', async () => {
    const supabase = createSupabase({ data: null });

    await expect(deleteExpiredRateLimits(supabase)).resolves.toBe(0);
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
