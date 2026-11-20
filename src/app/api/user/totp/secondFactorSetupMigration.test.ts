/**
 * @jest-environment node
 */

/**
 * 二段階認証の再認証コードのDB側の不変条件（#1368）
 *
 * ⚠️ **SQL は jest から実行できないので、書いてあることを読んで固定する。**
 *
 * ここが無いと、許可リストから値を落としても単体テストは1件も落ちない。
 * 気づくのは利用者が「確認コードが作れない」と言ってきたとき（23514）。
 */

import fs from 'fs';
import path from 'path';

// --- Helpers ---

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** 指定のパターンを含む最新のマイグレーションを読む */
function readMigration(pattern: RegExp): string {
  const file = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) =>
      pattern.test(
        stripComments(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8')),
      ),
    )
    .sort()
    .pop();

  // 落ちたら: 定義が見つからない。書き方を変えたならここも追従させる
  expect(file).toBeDefined();

  return fs.readFileSync(path.join(MIGRATIONS_DIR, file!), 'utf8');
}

/** `chk_otp_action_type` の許可リストを読む */
function readOtpActions(): string[] {
  const sql = stripComments(
    readMigration(/ADD CONSTRAINT chk_otp_action_type/),
  );
  const match = sql.match(
    /ADD CONSTRAINT chk_otp_action_type CHECK \(\s*action_type IN \(([\s\S]*?)\)\s*\)/,
  );

  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

// --- Tests ---

describe('otp_codes の second_factor_setup', () => {
  it('chk_otp_action_type に入っている', () => {
    expect(readOtpActions()).toContain('second_factor_setup');
  });

  /**
   * ⚠️ **全量再定義なので、既存の値を落とすと既存行が壊れる。**
   * とくに `login` は退役済みだが保持期間内の行が残りうる（#1361）。
   */
  it('既存の用途を1つも落とさない', () => {
    expect(readOtpActions()).toEqual(
      expect.arrayContaining([
        'registration',
        'login',
        'password_change',
        'two_factor',
        'email_change',
        'account_delete',
      ]),
    );
  });

  /**
   * ⛔ **`user_id` が無いと、攻撃者が自分のアカウントで取ったコードを
   * 奪った被害者のセッションで使える**（#1359 の critical と同じ形）。
   * 設定対象はセッションから決まるので、被害者のアカウントに攻撃者の
   * 第2要素が登録される。
   */
  it('user_id を必須にする', () => {
    expect(
      stripComments(
        readMigration(/ADD CONSTRAINT chk_second_factor_setup_has_user/),
      ),
    ).toMatch(
      /CHECK \(action_type <> 'second_factor_setup' OR user_id IS NOT NULL\)/,
    );
  });

  /**
   * ⚠️ **他の用途まで必須にしない。** registration / password_change /
   * two_factor は利用者が確定する前にも行を作る。
   */
  it('列そのものを NOT NULL にしない', () => {
    expect(
      readMigration(/ADD CONSTRAINT chk_second_factor_setup_has_user/),
    ).not.toMatch(/ALTER COLUMN user_id SET NOT NULL/);
  });

  /**
   * ⚠️ 既存の制約には触らない。`accountDeleteCodeMigration.test.ts` /
   * `emailChangeMigration.test.ts` が制約名と本文を実走査で固定している。
   */
  it.each([['chk_account_delete_has_user'], ['chk_email_change_has_user']])(
    '%s を作り直さない',
    (name) => {
      expect(
        readMigration(/ADD CONSTRAINT chk_second_factor_setup_has_user/),
      ).not.toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${name}`));
    },
  );

  /**
   * ⚠️ 送信枠は設定の試行枠と**別カウンタ**。許可リストに無いと
   * `checkRateLimit` の upsert が 23514 で落ち、送信そのものが失敗する。
   */
  it('chk_action_type に second_factor_setup_code_send が入っている', () => {
    const sql = readMigration(/'second_factor_setup_code_send'/);

    expect(sql).toMatch(/'second_factor_setup_code_send'/);
    // 既存の設定枠も残っていること
    expect(sql).toMatch(/'totp_settings_verify'/);
  });
});
