/**
 * @jest-environment node
 */

/**
 * `RATE_LIMIT_ACTION` と DB の許可リストを突き合わせる
 *
 * ⛔ **足し忘れるとレート制限が丸ごと機能しなくなる。**
 *
 * `consume_rate_limit` は `rate_limits` への upsert で判定するため、
 * `chk_action_type` に無い値を渡すと **23514 で落ちる**。`checkRateLimit` は
 * 例外を投げずに握るので（`rateLimit.ts`）、**呼び出し側からは「制限が
 * 掛かっていない」ようにしか見えない**。
 *
 * 気づけるのは「総当たりが止まらない」と誰かが気づいたときで、
 * それまで保護が無い状態が続く。ここで機械的に固定する。
 */

import fs from 'fs';
import path from 'path';

import {
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  RATE_LIMIT_DEFAULT,
} from './rateLimit';

// --- Helpers ---

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** 最新の `chk_action_type`（rate_limits）定義を読む */
function readLatestRateLimitActions(): string[] {
  const latest = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .filter((file) =>
      /ADD CONSTRAINT chk_action_type/.test(
        stripComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')),
      ),
    )
    .sort()
    .pop();

  // 落ちたら: 定義の書き方を変えたなら、この抽出も一緒に直すこと
  expect(latest).toBeDefined();

  const sql = stripComments(
    fs.readFileSync(path.join(MIGRATIONS_DIR, latest!), 'utf8'),
  );

  // ⚠️ `chk_otp_action_type`（otp_codes）が同じファイルにいることがある。
  //    接頭辞まで含めて境界を切る
  const match = sql.match(
    /ADD CONSTRAINT chk_action_type CHECK \(\s*action_type IN \(([\s\S]*?)\)\s*\)/,
  );

  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/**
 * 退役済み（コードからは使わないが既存行のために許可を残す）
 *
 * ⚠️ 消すと、保持期間内の行を持つ利用者が壊れる。
 *
 * `registration` / `password_change` は `OTP_ACTION` の値をそのまま
 * `rate_limits.action_type` に使っていた頃の名残で、現行コードからは
 * 使われていない（`RATE_LIMIT_ACTION` にも無い）。
 */
const RETIRED_ACTIONS = ['otp_resend', 'registration', 'password_change'];

// --- Tests ---

describe('rate_limits の action_type', () => {
  const allowed = readLatestRateLimitActions();
  const used = Object.values(RATE_LIMIT_ACTION) as string[];

  it.each(Object.entries(RATE_LIMIT_ACTION))(
    'RATE_LIMIT_ACTION.%s が許可リストに入っている',
    (_name, value) => {
      expect(allowed).toContain(value);
    },
  );

  /**
   * ⚠️ **全量再定義なので、既存の値を落とすと既存行が壊れる。**
   * 退役した値も許可リストには残す。
   */
  it('退役済みの値を落とさない', () => {
    expect(allowed).toEqual(expect.arrayContaining(RETIRED_ACTIONS));
  });

  /**
   * ⚠️ 逆向きも見る。許可リストにだけある値は、定数を消したのに
   * マイグレーションを直し忘れた形か、タイプミス。
   */
  it('許可リストに未使用の値を溜めない', () => {
    const orphans = allowed.filter(
      (value) => !used.includes(value) && !RETIRED_ACTIONS.includes(value),
    );

    expect(orphans).toEqual([]);
  });

  /**
   * ⚠️ **`RATE_LIMIT_CONFIG` のキーは `RATE_LIMIT_ACTION` と1対1ではない。**
   *
   * `LOGIN` の上限は `LOGIN_ACCOUNT`、`OTP_VERIFY` は
   * `OTP_CONFIG.VERIFY_RATE_LIMIT`、`TOTP_SETTINGS_VERIFY` は
   * `TOTP_SETTINGS_LIMIT` …と別名・別ファイルに散っている。
   * ここで名前の一致を機械的に見ると、実在する設定を「欠落」と誤判定する。
   *
   * 代わりに、**渡し忘れたときに落ちる既定値**が厳しすぎないことだけを見る。
   */
  it('既定値は 3回/30分（渡し忘れると厳しくなる）', () => {
    expect(RATE_LIMIT_DEFAULT).toEqual({ MAX_ATTEMPTS: 3, WINDOW_MINUTES: 30 });
  });

  /**
   * ⛔ **送信元ごとの層は利用者単位より厳しくする**（GHSA-p899-6g7w-v7hg）。
   *
   * 1つの送信元が利用者の枠を使い切れてしまうと、手前に層を足した意味が
   * 無くなる。パスワードを知る第三者が被害者のログインを妨害できる。
   */
  it('two_factor_send_prompt は two_factor_send より厳しい', () => {
    expect(RATE_LIMIT_CONFIG.TWO_FACTOR_SEND_PROMPT.maxAttempts).toBeLessThan(
      RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.maxAttempts,
    );
  });
});
