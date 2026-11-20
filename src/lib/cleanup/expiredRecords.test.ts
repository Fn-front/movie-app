/**
 * @jest-environment node
 */

/**
 * 保持期間切れレコードの掃除のテスト
 *
 * ループそのものは `batchedDelete.test.ts` が見る。ここは
 * 「どの対象を」「失敗したときどうするか」「保持期間が妥当か」を固定する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { OTP_CODE_RETENTION_HOURS } from '@/constants/otp';
import { PASSWORD_RESET_TOKEN_RETENTION_HOURS } from '@/constants/passwordReset';
import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';

import {
  CLEANUP_TARGETS,
  cleanupExpiredRecords,
  TIME_BUDGET_MS,
} from './expiredRecords';

/** RPC 名ごとに挙動を決められるクライアント */
const createSupabase = (
  behaviour: Record<string, { data?: unknown; error?: unknown }>,
) =>
  ({
    rpc: jest.fn((name: string) => {
      const result = behaviour[name] ?? { data: 0 };
      return Promise.resolve({
        data: result.data ?? 0,
        error: result.error ?? null,
      });
    }),
  }) as unknown as SupabaseClient;

describe('CLEANUP_TARGETS', () => {
  /**
   * ⚠️ 対象の取りこぼしは**何も壊れないので気づけない**。
   *
   * #978 は「ドキュメントには定期削除と書いてあるがジョブは存在しない」
   * 状態が長く続いた。個人データを持つテーブルが増えたらここに足す。
   */
  it('個人データを持つ3テーブルを対象にしている', () => {
    expect(CLEANUP_TARGETS.map((t) => t.name)).toEqual([
      'rate_limits',
      'otp_codes',
      'password_reset_tokens',
    ]);
  });

  it('対象ごとに保持期間の定数を使う（ベタ書きしない）', () => {
    const byName = Object.fromEntries(CLEANUP_TARGETS.map((t) => [t.name, t]));

    expect(byName.rate_limits.retentionHours).toBe(RATE_LIMIT_RETENTION_HOURS);
    expect(byName.otp_codes.retentionHours).toBe(OTP_CODE_RETENTION_HOURS);
    expect(byName.password_reset_tokens.retentionHours).toBe(
      PASSWORD_RESET_TOKEN_RETENTION_HOURS,
    );
  });
});

describe('cleanupExpiredRecords', () => {
  it('全対象を掃除して合計と完走を返す', async () => {
    const supabase = createSupabase({
      delete_expired_rate_limits: { data: 0 },
      delete_expired_otp_codes: { data: 0 },
      delete_expired_password_reset_tokens: { data: 0 },
    });

    const result = await cleanupExpiredRecords(supabase);

    expect(result.completed).toBe(true);
    expect(result.hasError).toBe(false);
    expect(result.targets).toHaveLength(CLEANUP_TARGETS.length);
  });

  /**
   * ⚠️ ここが専用CRONにした目的（#933）の延長。
   *
   * 「無関係な処理の失敗でスキップされない」ために専用CRONにしたのに、
   * 対象を増やした結果1つの失敗で残りが止まるなら本末転倒。
   */
  it('1つが失敗しても残りの対象を掃除する', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const supabase = createSupabase({
        delete_expired_rate_limits: { error: { message: 'boom' } },
        delete_expired_otp_codes: { data: 0 },
        delete_expired_password_reset_tokens: { data: 0 },
      });

      const result = await cleanupExpiredRecords(supabase);

      const failed = result.targets.find((t) => t.name === 'rate_limits');
      expect(failed?.error).toContain('boom');

      // 後続は実行されている
      const others = result.targets.filter((t) => t.name !== 'rate_limits');
      expect(others).toHaveLength(2);
      expect(others.every((t) => t.completed)).toBe(true);

      expect(result.hasError).toBe(true);
      expect(result.completed).toBe(false);
    } finally {
      error.mockRestore();
    }
  });

  it('失敗した対象の削除件数は0で、成功した対象の件数は残る', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const supabase = createSupabase({
        delete_expired_rate_limits: { data: 0 },
        delete_expired_otp_codes: { error: { message: 'boom' } },
        delete_expired_password_reset_tokens: { data: 0 },
      });

      const result = await cleanupExpiredRecords(supabase);
      const byName = Object.fromEntries(result.targets.map((t) => [t.name, t]));

      expect(byName.otp_codes.deleted_count).toBe(0);
      expect(byName.otp_codes.completed).toBe(false);
      expect(byName.password_reset_tokens.completed).toBe(true);
    } finally {
      error.mockRestore();
    }
  });
});

describe('保持期間', () => {
  it('3テーブルとも48時間で揃えている', () => {
    // 別々の値にすると privacy の説明が増えるだけで意味が無い
    expect(RATE_LIMIT_RETENTION_HOURS).toBe(48);
    expect(OTP_CODE_RETENTION_HOURS).toBe(48);
    expect(PASSWORD_RESET_TOKEN_RETENTION_HOURS).toBe(48);
  });

  /**
   * 時間予算と maxDuration の関係を固定する（#1342）
   *
   * 予算の判定はループ**末尾**にあるため、最後の1回の所要時間は予算の外側。
   * `statement_timeout = 8s` が縛るのは SQL の実行時間だけで、コネクション
   * 取得待ちやネットワークは含まない。
   *
   * ⚠️ 予算は**全対象で共有**する（`cleanupExpiredRecords` が1つ作って配る）。
   * 対象ごとに持たせると 3 × 35秒 = 105秒 で maxDuration を超える。
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
      path.join(
        __dirname,
        '../../app/api/cron/cleanup-expired-records/route.ts',
      ),
      'utf8',
    );
    const matched = routeSource.match(/export const maxDuration = (\d+)/);

    // 読み取りが壊れていたら気づけるようにする（undefined なら常に通る比較を避ける）
    expect(matched).not.toBeNull();

    const maxDurationMs = Number(matched![1]) * 1000;

    expect(TIME_BUDGET_MS + STATEMENT_TIMEOUT_MS).toBeLessThan(maxDurationMs);
  });

  /**
   * #933 の中心的な設計判断を守る不変条件
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
  describe('レート制限ウィンドウとの関係', () => {
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
      // database-schema.md の記述も揃えること
      expect(longest.path).toContain('OTP_CONFIG.DAILY_SEND_WINDOW_MINUTES');
      expect(longest.minutes).toBe(1440);
    });
  });

  /**
   * ⚠️ OTP の保持期間は**再送間隔より長い**こと。
   *
   * `auth/otp/send` の60秒の再送間隔は、直前の `otp_codes` 行の
   * `created_at` **だけ**を根拠にしている。期限切れ直後に消してしまうと
   * その根拠が消え、再送間隔が素通りする。
   */
  it('OTP の保持期間は再送間隔より十分長い', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTP_CONFIG } = require('@/constants/otp');

    expect(OTP_CODE_RETENTION_HOURS * 3600).toBeGreaterThan(
      OTP_CONFIG.RESEND_INTERVAL_SECONDS,
    );
    // 有効期限より後に消すのも当然の前提
    expect(OTP_CODE_RETENTION_HOURS * 60).toBeGreaterThan(
      OTP_CONFIG.EXPIRY_MINUTES,
    );
  });
});
