/**
 * @jest-environment node
 */

/**
 * 「ほぼ全滅」の通知テスト（#1354）
 *
 * 固定したいのは境界そのもの。ここが緩むと**鳴り続けて無視される**か、
 * **全滅を見逃す**かのどちらかに倒れる。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { CRON_FAILURE_RATE_THRESHOLD } from '@/constants/cron';

// --- Mocks ---

const mockNotifyCronFailure = jest.fn();
jest.mock('./notifyCronFailure', () => ({
  notifyCronFailure: (...args: unknown[]) => mockNotifyCronFailure(...args),
}));

import { notifyIfMostlyFailed } from './notifyHighFailureRate';

// --- Helpers ---

const supabase = {} as SupabaseClient;

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifyCronFailure.mockResolvedValue(true);
});

// --- Tests ---

describe('notifyIfMostlyFailed', () => {
  it('全滅したら通知する', async () => {
    await expect(
      notifyIfMostlyFailed(supabase, {
        cronName: 'sync-streaming',
        attempted: 40,
        failed: 40,
      }),
    ).resolves.toBe(true);

    expect(mockNotifyCronFailure).toHaveBeenCalledWith(supabase, {
      cronName: 'sync-streaming',
      reason: '40件中 40件が失敗しました（100%）',
    });
  });

  /**
   * ⚠️ **1件でも失敗したら通知、にはしない。** 作品側の事情で恒常的に
   * 数件落ちるため、鳴り続けて無視されるようになる。
   */
  it('数件の失敗では通知しない', async () => {
    await expect(
      notifyIfMostlyFailed(supabase, {
        cronName: 'sync-streaming',
        attempted: 100,
        failed: 3,
      }),
    ).resolves.toBe(false);

    expect(mockNotifyCronFailure).not.toHaveBeenCalled();
  });

  /**
   * 境界は「しきい値以上で通知」。
   *
   * ⚠️ 定数から計算して組み立てる。数値を直書きすると、しきい値を変えた人が
   * **テストを直さないまま通してしまう**。
   */
  describe('境界', () => {
    const attempted = 100;
    const atThreshold = attempted * CRON_FAILURE_RATE_THRESHOLD;

    it('ちょうどしきい値なら通知する', async () => {
      await expect(
        notifyIfMostlyFailed(supabase, {
          cronName: 'sync-streaming',
          attempted,
          failed: atThreshold,
        }),
      ).resolves.toBe(true);
    });

    it('しきい値を1件下回れば通知しない', async () => {
      await expect(
        notifyIfMostlyFailed(supabase, {
          cronName: 'sync-streaming',
          attempted,
          failed: atThreshold - 1,
        }),
      ).resolves.toBe(false);
    });
  });

  /**
   * ⚠️ **0件の実行は失敗ではない。**
   *
   * 弾かずに通すと 0/0 が NaN になり、比較が常に false になる。
   * 「たまたま動いている」状態なので、明示的に弾いて意図を残す。
   */
  it.each([
    ['対象が無い', 0, 0],
    ['対象が無いのに失敗だけある', 0, 5],
    ['全件成功', 50, 0],
  ])('%s なら通知しない', async (_label, attempted, failed) => {
    await expect(
      notifyIfMostlyFailed(supabase, {
        cronName: 'sync-streaming',
        attempted,
        failed,
      }),
    ).resolves.toBe(false);

    expect(mockNotifyCronFailure).not.toHaveBeenCalled();
  });

  it('手がかりを本文に載せる', async () => {
    await notifyIfMostlyFailed(supabase, {
      cronName: 'sync-streaming',
      attempted: 10,
      failed: 10,
      detail: 'availability タイトル: 401',
    });

    expect(mockNotifyCronFailure).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        reason: expect.stringContaining('availability タイトル: 401'),
      }),
    );
  });

  /**
   * ⚠️ 連投抑止の識別子は CRON 名。渡した名前がそのまま
   * `notifyCronFailure` へ行くことを確かめる。
   */
  it('CRON 名をそのまま渡す', async () => {
    await notifyIfMostlyFailed(supabase, {
      cronName: 'update-movies',
      attempted: 10,
      failed: 10,
    });

    expect(mockNotifyCronFailure).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ cronName: 'update-movies' }),
    );
  });

  it('通知が送れなければ false を返す', async () => {
    mockNotifyCronFailure.mockResolvedValue(false);

    await expect(
      notifyIfMostlyFailed(supabase, {
        cronName: 'sync-streaming',
        attempted: 10,
        failed: 10,
      }),
    ).resolves.toBe(false);
  });

  /**
   * ⚠️ DB へ繋げないこと自体が失敗の原因でありうる。
   * `notifyCronFailure` 側で連投抑止を諦めて送る契約なので、そのまま渡す。
   */
  it('supabase が null でもそのまま渡す', async () => {
    await notifyIfMostlyFailed(null, {
      cronName: 'sync-streaming',
      attempted: 10,
      failed: 10,
    });

    expect(mockNotifyCronFailure).toHaveBeenCalledWith(null, expect.anything());
  });
});
