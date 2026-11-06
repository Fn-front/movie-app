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
