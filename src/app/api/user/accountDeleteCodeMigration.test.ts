/**
 * @jest-environment node
 */

/**
 * 退会の確認コードのDB側の不変条件（#1362）
 *
 * ⚠️ **SQL は jest から実行できないので、書いてあることを読んで固定する。**
 *
 * `user_id` 必須はアプリ側の INSERT 1行でも担保しているが、そこを壊すと
 * 失敗の出方が「確認コードが正しくありません」になり、原因に辿り着けない。
 * スキーマでも縛る（#1359 の MIN-4 と同じ）。
 */

import fs from 'fs';
import path from 'path';

// --- Helpers ---

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/** 指定のパターンを含む最新のマイグレーションを読む */
function readMigration(pattern: RegExp): string {
  const file = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) =>
      pattern.test(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8')),
    )
    .sort()
    .pop();

  // 落ちたら: 定義が見つからない。書き方を変えたならここも追従させる
  expect(file).toBeDefined();

  return fs.readFileSync(path.join(MIGRATIONS_DIR, file!), 'utf8');
}

// --- Tests ---

describe('otp_codes の account_delete', () => {
  /**
   * ⛔ **`user_id` が無いと、攻撃者が自分のアカウントで取ったコードを
   * 奪った被害者のセッションで使える**（#1359 の critical と同じ形）。
   * 削除対象はセッションから決まるので、被害者のアカウントが消える。
   */
  it('user_id を必須にする', () => {
    const sql = readMigration(/ADD CONSTRAINT chk_account_delete_has_user/);

    expect(sql).toMatch(
      /CHECK \(action_type <> 'account_delete' OR user_id IS NOT NULL\)/,
    );
  });

  /**
   * ⚠️ **他の用途まで必須にしない。** registration / password_change /
   * two_factor は利用者が確定する前にも行を作るため、NOT NULL にすると
   * 新規登録そのものが落ちる。
   */
  it('列そのものを NOT NULL にしない', () => {
    const sql = readMigration(/ADD CONSTRAINT chk_account_delete_has_user/);

    expect(sql).not.toMatch(/ALTER COLUMN user_id SET NOT NULL/);
  });

  /**
   * ⚠️ **#1359 の制約には触らない。** あちらは
   * `emailChangeMigration.test.ts` が制約名と本文を実走査で固定している。
   */
  it('email_change の制約を作り直さない', () => {
    const sql = readMigration(/ADD CONSTRAINT chk_account_delete_has_user/);

    expect(sql).not.toMatch(
      /DROP CONSTRAINT IF EXISTS chk_email_change_has_user/,
    );
  });

  // DB の許可リストに無いと 23514 で INSERT できない
  it('chk_otp_action_type に account_delete が入っている', () => {
    const sql = readMigration(/ADD CONSTRAINT chk_otp_action_type/).replace(
      /--[^\n]*/g,
      '',
    );

    const match = sql.match(
      /ADD CONSTRAINT chk_otp_action_type CHECK \(\s*action_type IN \(([\s\S]*?)\)\s*\)/,
    );

    expect(match).not.toBeNull();
    expect([...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toContain(
      'account_delete',
    );
  });

  /**
   * ⚠️ **全量再定義なので、既存の値を落とすと既存行が壊れる。**
   * とくに `login` は退役済みだが保持期間内の行が残りうる（#1361）。
   */
  it('既存の用途を1つも落とさない', () => {
    const sql = readMigration(/ADD CONSTRAINT chk_otp_action_type/).replace(
      /--[^\n]*/g,
      '',
    );
    const match = sql.match(
      /ADD CONSTRAINT chk_otp_action_type CHECK \(\s*action_type IN \(([\s\S]*?)\)\s*\)/,
    );
    const allowed = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(allowed).toEqual(
      expect.arrayContaining([
        'registration',
        'login',
        'password_change',
        'two_factor',
        'email_change',
      ]),
    );
  });

  /**
   * ⚠️ 送信枠は削除の試行枠と**別カウンタ**。許可リストに無いと
   * `checkRateLimit` の upsert が 23514 で落ち、**制限が無言で無効化される**
   * のではなく送信そのものが失敗する。
   */
  it('chk_action_type に account_delete_code_send が入っている', () => {
    const sql = readMigration(/'account_delete_code_send'/);

    expect(sql).toMatch(/'account_delete_code_send'/);
    // 既存の削除枠も残っていること
    expect(sql).toMatch(/'account_delete'/);
  });
});
