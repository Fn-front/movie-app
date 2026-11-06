/**
 * レート制限レコードの保持期間（#933）
 *
 * 削除条件は SQL（`delete_expired_rate_limits`）にあるため、jest のモックでは
 * 検証できない。実DBに4種類の行を仕込み、RPC を1回呼んでどれが残るかを見る。
 *
 * 条件が単純な時刻比較ではない点が肝。
 * - `created_at` は使えない。行は upsert で再利用され初回作成時刻のままなので、
 *   これを基準にするとカウント中の行まで消える
 * - `last_attempt_at` だけでも足りない。ロック中は `last_attempt_at` を更新
 *   しない仕様（`consume_rate_limit`）なので、ロックが早期解除される
 *
 * ⚠️ ブラウザは使わないが、DBヘルパーが e2e 側にあるためここに置く。
 */

import { test, expect } from '@playwright/test';

import {
  cleanupRunRateLimits,
  getRateLimitRow,
  runDeleteExpiredRateLimits,
  seedRateLimitRow,
} from '../helpers/api';
import { runScopedEmail } from '../helpers/runScope';

/** 保持期間（`src/constants/rateLimit.ts` の RATE_LIMIT_RETENTION_HOURS と揃える） */
const RETENTION_HOURS = 48;

/**
 * `chk_action_type` が許す値を使う
 *
 * 識別子はメールアドレスなので、`login_ip` ではなくメール単位の種別にする。
 * run 固有のメールなので他 run とは衝突せず、teardown の
 * `cleanupRunRateLimits` が前方一致でまとめて消す。
 */
const ACTION_TYPE = 'otp_send_daily';

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3600_000).toISOString();
const hoursLater = (hours: number) =>
  new Date(Date.now() + hours * 3600_000).toISOString();

/** 仕込む4種類の行 */
const ROWS = {
  /** 保持期間を過ぎ、ロックもしていない → 消える */
  expired: {
    identifier: runScopedEmail('e2e-retention-expired'),
    lastAttemptAt: hoursAgo(RETENTION_HOURS + 24),
    lockedUntil: null,
  },
  /** 保持期間を過ぎているが、ロック中 → 残る */
  locked: {
    identifier: runScopedEmail('e2e-retention-locked'),
    lastAttemptAt: hoursAgo(RETENTION_HOURS + 24),
    lockedUntil: hoursLater(12),
  },
  /** 直近に試行があり、カウント中 → 残る */
  counting: {
    identifier: runScopedEmail('e2e-retention-counting'),
    lastAttemptAt: hoursAgo(1),
    lockedUntil: null,
  },
  /** 保持期間を過ぎ、ロックも明けている → 消える */
  lockExpired: {
    identifier: runScopedEmail('e2e-retention-lock-expired'),
    lastAttemptAt: hoursAgo(RETENTION_HOURS + 24),
    lockedUntil: hoursAgo(1),
  },
} as const;

test.describe('レート制限レコードの保持期間', () => {
  // RPC を1回だけ呼び、その結果を各テストで見る
  test.describe.configure({ mode: 'serial' });

  // 認証を使わないので storageState は空でよい
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    for (const row of Object.values(ROWS)) {
      await seedRateLimitRow({
        identifier: row.identifier,
        actionType: ACTION_TYPE,
        attempts: 3,
        lastAttemptAt: row.lastAttemptAt,
        lockedUntil: row.lockedUntil,
      });
    }

    await runDeleteExpiredRateLimits(RETENTION_HOURS);
  });

  test.afterAll(async () => {
    // global.teardown でも消えるが、同じ run の他 spec へ残骸を持ち越さない
    await cleanupRunRateLimits();
  });

  test('保持期間を過ぎ、ロックもしていない行は消える', async () => {
    expect(await getRateLimitRow(ROWS.expired.identifier, ACTION_TYPE)).toBe(
      null,
    );
  });

  test('ロック中の行は、最終試行が保持期間より古くても消えない', async () => {
    // ロック中は last_attempt_at が更新されないため、時刻だけで消すと
    // ロックが早期解除される（= 上限に達した相手の試行回数がリセットされる）
    const row = await getRateLimitRow(ROWS.locked.identifier, ACTION_TYPE);

    expect(row).not.toBeNull();
    expect(row?.locked_until).not.toBeNull();
  });

  test('カウント中（最終試行が保持期間内）の行は消えない', async () => {
    const row = await getRateLimitRow(ROWS.counting.identifier, ACTION_TYPE);

    expect(row).not.toBeNull();
    expect(row?.attempts).toBe(3);
  });

  test('ロックが明けていれば、保持期間を過ぎた行は消える', async () => {
    expect(
      await getRateLimitRow(ROWS.lockExpired.identifier, ACTION_TYPE),
    ).toBe(null);
  });
});
