/**
 * @jest-environment node
 */

/**
 * 保持期間切れレコードの掃除のテスト
 *
 * ループそのものは `batchedDelete.test.ts` が見る。ここは
 * 「どの対象を」「失敗したときどうするか」「保持期間が妥当か」を固定する。
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { SOFT_DELETED_LIST_RETENTION_HOURS } from '@/constants/cleanup';
import { OTP_CODE_RETENTION_HOURS } from '@/constants/otp';
import { PASSWORD_RESET_TOKEN_RETENTION_HOURS } from '@/constants/passwordReset';
import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';
import {
  RECOMMENDATION_EVENT_RETENTION_DAYS,
  RECOMMENDATION_EVENT_RETENTION_HOURS,
} from '@/constants/recommendations';

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
  it('個人データを持つ7テーブルを対象にしている', () => {
    expect(CLEANUP_TARGETS.map((t) => t.name)).toEqual([
      'rate_limits',
      'otp_codes',
      'password_reset_tokens',
      // ⚠️ #1355 でレコメンド生成CRONから移した。あちらは失敗を catch して
      //    0 を返していたため、消えていないことに気づけなかった
      'recommendation_events',
      // ⚠️ #433 で追加。論理削除された利用者リストは `deleted_at` が入っても
      //    行が残り、TMDb 由来の表示列を保持し続けていた（本番実測で
      //    6ヶ月超が21件）。順番は意図的に末尾
      //    （`expiredRecords.ts` の CLEANUP_TARGETS のコメント参照）
      'favorites',
      'watchlist',
      'dismissed_movies',
    ]);
  });

  it('対象ごとに保持期間の定数を使う（ベタ書きしない）', () => {
    const byName = Object.fromEntries(CLEANUP_TARGETS.map((t) => [t.name, t]));

    expect(byName.rate_limits.retentionHours).toBe(RATE_LIMIT_RETENTION_HOURS);
    expect(byName.otp_codes.retentionHours).toBe(OTP_CODE_RETENTION_HOURS);
    expect(byName.password_reset_tokens.retentionHours).toBe(
      PASSWORD_RESET_TOKEN_RETENTION_HOURS,
    );
    expect(byName.recommendation_events.retentionHours).toBe(
      RECOMMENDATION_EVENT_RETENTION_HOURS,
    );
  });

  /**
   * ⚠️ 上のテストだけではトートロジーになる（#1355）。
   *
   * 定数どうしを突き合わせているので、`RECOMMENDATION_EVENT_RETENTION_HOURS`
   * の**導出そのものが壊れても両辺が同じ値になって通る**（実測。`* 24` を
   * 消しても1件も落ちなかった）。換算をここで独立に組み直す。
   *
   * 仕様は日数（90日）。RPC の引数は時間で揃えてあるので、ここがずれると
   * **保持期間が 1/24 になって、まだ消してはいけない行動ログが消える**。
   */
  it('保持時間は保持日数から正しく換算されている', () => {
    expect(RECOMMENDATION_EVENT_RETENTION_HOURS).toBe(
      RECOMMENDATION_EVENT_RETENTION_DAYS * 24,
    );
  });

  /**
   * ⚠️ **換算の式を固定するだけでは足りない。**
   *
   * 上のテストは両辺が同じ定数から出ているため、`90 → 1` と書き換えると
   * **一緒に動いて素通りする**（レビューで実測）。90日は仕様そのもので、
   * 短くすると利用者の行動ログを予定より早く消すことになる。
   *
   * ⚠️ このPR以降 `RECOMMENDATION_EVENT_RETENTION_DAYS` を読むのは
   * 下の導出だけになった。値を守るのはここしかない。
   */
  it('保持期間は90日', () => {
    expect(RECOMMENDATION_EVENT_RETENTION_DAYS).toBe(90);
    expect(RECOMMENDATION_EVENT_RETENTION_HOURS).toBe(2160);
  });

  /**
   * ⚠️ **RPC 名は typo しても気づけない。**
   *
   * 既存3つは失敗注入テストが RPC 名をキーにしているので**偶然**
   * 固定されているが、新しい対象は `{ data: 0 }` でしか登場せず、
   * モックのフォールバックが任意の名前を受け入れる。
   * 本番では PGRST202 → `hasError` → 500 + 通知で気づけるが、
   * 「気づけない状態を直す」PR で配線が無保護なのは弱い。
   */
  it('対象ごとに正しい RPC を呼ぶ', () => {
    expect(CLEANUP_TARGETS.map((t) => t.rpc)).toEqual([
      'delete_expired_rate_limits',
      'delete_expired_otp_codes',
      'delete_expired_password_reset_tokens',
      'delete_expired_recommendation_events',
      'delete_expired_favorites',
      'delete_expired_watchlist',
      'delete_expired_dismissed_movies',
    ]);
  });

  /**
   * 論理削除された利用者リストの保持期間（#433）
   */
  describe('論理削除された利用者リスト', () => {
    const SOFT_DELETE_TARGETS = ['favorites', 'watchlist', 'dismissed_movies'];

    it('3テーブルで同じ定数を共有する', () => {
      const byName = Object.fromEntries(
        CLEANUP_TARGETS.map((t) => [t.name, t]),
      );

      for (const name of SOFT_DELETE_TARGETS) {
        expect(byName[name].retentionHours).toBe(
          SOFT_DELETED_LIST_RETENTION_HOURS,
        );
      }
    });

    /**
     * ⚠️ 定数どうしの突き合わせだけではトートロジーになる（#1355 で実測済み）。
     * 30日という値そのものを独立に固定する。
     */
    it('保持期間は30日', () => {
      expect(SOFT_DELETED_LIST_RETENTION_HOURS).toBe(720);
    });

    /**
     * ⚠️ **RPC 側の下限ガードと対になっている。**
     *
     * `delete_expired_favorites` などは `retention_hours < 720` を
     * RAISE EXCEPTION で弾く
     * （`20261122000000_add_soft_deleted_list_cleanup_rpcs.sql`）。
     * 定数だけ短くすると、CRON が毎日 RPC に蹴られて**1件も消えないまま
     * `hasError` で 500 を返し続ける**。ズレをここで検出する。
     */
    it('RPC の下限ガードを下回っていない', () => {
      // ⚠️ **固定のファイル名を読まないこと。** 後続のマイグレーションが
      //    CREATE OR REPLACE でガードを書き換えても、古いファイルを読む限り
      //    緑のまま通る（cleanup.ts のコメントが嘘になる）。
      //    3つの RPC を定義している**最新の**マイグレーションを探す
      const migrationsDir = join(__dirname, '../../../supabase/migrations');
      const latest = readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort()
        .reverse()
        .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
        .find((sql) =>
          SOFT_DELETE_TARGETS.every((table) =>
            sql.includes(`delete_expired_${table}(`),
          ),
        );

      expect(latest).toBeDefined();

      const guards = latest!.match(/retention_hours < (\d+)/g) ?? [];

      // 3つの RPC それぞれにガードがあること
      expect(guards).toHaveLength(SOFT_DELETE_TARGETS.length);

      for (const guard of guards) {
        // ⚠️ **同値を要求しない。** 保持期間を**伸ばす**のは RPC 側で何も
        //    問題が無い（下限以上なので通る）のに、同値だと落ちる。直そうと
        //    すると適用済みのマイグレーションを編集することになり、
        //    それは本番へ届かない（.claude/rules/supabase-db.md）
        expect(SOFT_DELETED_LIST_RETENTION_HOURS).toBeGreaterThanOrEqual(
          Number(guard.replace('retention_hours < ', '')),
        );
      }
    });

    /**
     * ⚠️ TMDb 利用規約 Section 1.C は6ヶ月を上限にしている。保持期間を
     * そこへ近づけると、物理削除が間に合わずに規約違反へ戻る。
     */
    it('TMDb の6ヶ月ルールを大きく下回る', () => {
      const SIX_MONTHS_HOURS = 24 * 30 * 6;

      expect(SOFT_DELETED_LIST_RETENTION_HOURS).toBeLessThan(
        SIX_MONTHS_HOURS / 2,
      );
    });

    /**
     * ⛔ **E2E のヘルパーから呼べるようにしない。**
     *
     * `e2e/helpers/api.ts` の `runDeleteExpired` は `retention_hours` を
     * 引数でそのまま RPC へ流す。手元の `npm run test:e2e` は既定で
     * **本番 Supabase を叩く**（`.claude/rules/testing.md`）ので、union に
     * 足すと1回の呼び出しで全利用者のお気に入りが消える経路ができる。
     *
     * RPC 側の下限ガード（720時間）が最後の砦だが、そもそも呼べないように
     * しておく。既存3つが認証の一時データ（再発行できる）なのに対し、
     * こちらは**再発行できない利用者生成コンテンツ**。
     */
    it('E2E ヘルパーの RPC 一覧に入っていない', () => {
      const helper = readFileSync(
        join(__dirname, '../../../e2e/helpers/api.ts'),
        'utf8',
      );

      const union = helper.match(/type DeleteExpiredRpc =[\s\S]*?;/)?.[0] ?? '';

      expect(union).not.toBe('');

      for (const target of CLEANUP_TARGETS.filter((t) =>
        SOFT_DELETE_TARGETS.includes(t.name),
      )) {
        expect(union).not.toContain(target.rpc);
      }
    });
  });
});

describe('cleanupExpiredRecords', () => {
  it('全対象を掃除して合計と完走を返す', async () => {
    const supabase = createSupabase({
      delete_expired_rate_limits: { data: 0 },
      delete_expired_otp_codes: { data: 0 },
      delete_expired_password_reset_tokens: { data: 0 },
      delete_expired_recommendation_events: { data: 0 },
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
        delete_expired_recommendation_events: { data: 0 },
      });

      const result = await cleanupExpiredRecords(supabase);

      const failed = result.targets.find((t) => t.name === 'rate_limits');
      expect(failed?.error).toContain('boom');

      // 後続は実行されている
      const others = result.targets.filter((t) => t.name !== 'rate_limits');
      expect(others).toHaveLength(CLEANUP_TARGETS.length - 1);
      expect(others.every((t) => t.completed)).toBe(true);

      expect(result.hasError).toBe(true);
      expect(result.completed).toBe(false);
    } finally {
      error.mockRestore();
    }
  });

  /**
   * ⚠️ 時間予算は**全対象で共有する**。
   *
   * 対象ごとに `Date.now() + TIME_BUDGET_MS` を作ると、4対象で
   * 3 × 35秒 = 105秒 になり `maxDuration`（60秒）を超えて強制終了される。
   * 削除件数のログすら残らない。
   *
   * 下の `expiredRecords.test.ts` の不変条件テストは「1対象ぶんの予算 <
   * maxDuration」しか見ないので、**共有しているかどうかは別に固定する**。
   * 実際、予算を対象ごとに持たせる変異を当てても他のテストは全部緑だった。
   *
   * 既に予算を使い切った状態から始めれば、共有していれば**1対象目で
   * 打ち切られて残りは1バッチずつで終わる**。対象ごとに持たせていると
   * どの対象も最初の判定を通過してしまう。
   */
  it('時間予算を全対象で共有する（対象ごとに持たせない）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.useFakeTimers();

    try {
      // ⚠️ `Date.now` を `mockReturnValueOnce` で積まない。**実装の
      //   `Date.now()` 呼び出し回数に依存**し、挙動を変えないリファクタ
      //   （計測用に1行足す等）で壊れる。時計そのものを進める
      //
      // 1バッチごとに20秒進む＝2バッチで予算（35秒）を使い切る。
      // 常に満杯を返すので、止まるのは時間予算だけ
      const rpc = jest.fn().mockImplementation(() => {
        jest.setSystemTime(Date.now() + 20_000);
        return Promise.resolve({ data: 500, error: null });
      });
      const supabase = { rpc } as unknown as SupabaseClient;

      const result = await cleanupExpiredRecords(supabase);

      // 共有していれば、1つ目が予算を使い切った時点で残りは1回も投げない。
      //
      // ⛔ 対象ごとに予算を作っていると、2つ目以降は deadline が未来になり
      //    それぞれ2バッチずつ回る（4対象 × 2 = 8回）
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(result.completed).toBe(false);
      // 残りの対象も「消し残しあり」として報告される（黙って飛ばさない）
      expect(result.targets).toHaveLength(CLEANUP_TARGETS.length);
      expect(result.targets.every((t) => !t.completed)).toBe(true);
    } finally {
      jest.useRealTimers();
      warn.mockRestore();
    }
  });

  it('失敗した対象の削除件数は0で、成功した対象の件数は残る', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const supabase = createSupabase({
        delete_expired_rate_limits: { data: 0 },
        delete_expired_otp_codes: { error: { message: 'boom' } },
        delete_expired_password_reset_tokens: { data: 0 },
        delete_expired_recommendation_events: { data: 0 },
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

  /**
   * ⚠️ 失敗までに確定した削除件数を**構造化データに残す**。
   *
   * 各 RPC は独立したトランザクションなので、N-1 バッチ分の削除は確定して
   * いる。`deleted_count: 0` で握り直すと、件数を合計する監視が過少申告する
   * （メッセージの文字列にしか残らない）。
   */
  it('途中で失敗しても、確定した削除件数は deleted_count に残る', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // 1バッチ目は成功（500件）、2バッチ目で失敗
      let calls = 0;
      const supabase = {
        rpc: jest.fn((name: string) => {
          if (name !== 'delete_expired_otp_codes') {
            return Promise.resolve({ data: 0, error: null });
          }
          calls += 1;
          return calls === 1
            ? Promise.resolve({ data: 500, error: null })
            : Promise.resolve({ data: null, error: { message: 'boom' } });
        }),
      } as unknown as SupabaseClient;

      const result = await cleanupExpiredRecords(supabase);
      const otp = result.targets.find((t) => t.name === 'otp_codes');

      expect(otp?.deleted_count).toBe(500);
      expect(otp?.completed).toBe(false);
      expect(otp?.error).toContain('500件は削除済み');
    } finally {
      error.mockRestore();
    }
  });
});

describe('保持期間', () => {
  it('認証まわりの3テーブルは48時間で揃えている', () => {
    // 別々の値にすると privacy の説明が増えるだけで意味が無い
    expect(RATE_LIMIT_RETENTION_HOURS).toBe(48);
    expect(OTP_CODE_RETENTION_HOURS).toBe(48);
    expect(PASSWORD_RESET_TOKEN_RETENTION_HOURS).toBe(48);
  });

  /**
   * 時間予算と maxDuration の関係を固定する（#1342）
   *
   * 予算の判定はループ**先頭**にあるため、最後の1回の所要時間は予算の外側。
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
