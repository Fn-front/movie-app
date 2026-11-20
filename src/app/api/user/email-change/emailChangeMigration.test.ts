/**
 * @jest-environment node
 */

/**
 * メールアドレス変更のDB側の不変条件（#1359）
 *
 * ⚠️ **SQL は jest から実行できないので、書いてあることを読んで固定する。**
 *
 * ここが無いと `change_user_email` の中身を書き換えても単体テストは1件も
 * 落ちない（レビュー前の実測で「旧アドレスの跡を消さない」変異が生き残った）。
 * 消し残りに気づくのは、利用者が「新しいアドレスなのに送信上限に達した」と
 * 報告してきたときになる。
 */

import fs from 'fs';
import path from 'path';

// --- Helpers ---

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/** `change_user_email` を定義している最新のマイグレーションを読む */
function readMigration(): string {
  const file = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) =>
      /CREATE OR REPLACE FUNCTION public\.change_user_email/.test(
        fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'),
      ),
    )
    .sort()
    .pop();

  // 落ちたら: 関数の定義が見つからない。作り直したならここも追従させる
  expect(file).toBeDefined();

  return fs.readFileSync(path.join(MIGRATIONS_DIR, file!), 'utf8');
}

// --- Tests ---

describe('change_user_email', () => {
  const body = readMigration().replace(/--[^\n]*/g, '');

  it('users.email を差し替える', () => {
    expect(body).toMatch(/UPDATE users\s+SET email = p_new_email/);
  });

  /**
   * ⚠️ **`rate_limits` の識別子はメールアドレスそのもの。**
   *
   * `otp_send_daily` / `password_reset_request` は生のアドレス、ログイン系は
   * `メールアドレス|IP`。残すと**古いアドレスの行が永久に残り、新しい
   * アドレスは枠0から始まる**。
   */
  it('旧アドレスの rate_limits を完全一致と前方一致で消す', () => {
    expect(body).toMatch(/DELETE FROM rate_limits/);
    expect(body).toMatch(/identifier = v_old_email/);
    expect(body).toMatch(/starts_with\(identifier, v_old_email \|\| '\|'\)/);
  });

  /**
   * ⛔ **`LIKE` を使わない。**
   *
   * メールアドレスには `_` や `%` が入りうる（`a_b@example.com` は正当）。
   * `LIKE v_old_email || '|%'` だと `_` が任意1文字として働き、
   * **他人の行まで消す**（#932 と同じ理由）。
   */
  it('前方一致は starts_with で行う', () => {
    expect(body).not.toMatch(/identifier\s+LIKE/i);
  });

  /**
   * ⚠️ `otp_codes` は `email` 列で引く。旧アドレス宛の未使用コードが
   * 宙に浮くので、期限切れを待たず消す。
   */
  it('旧アドレスの otp_codes を消す', () => {
    expect(body).toMatch(/DELETE FROM otp_codes\s+WHERE email = v_old_email/);
  });

  /**
   * ⚠️ 通知は**旧アドレス**へ送る。新アドレスへ送っても乗っ取った側に
   * 届くだけで、持ち主は気づけない。
   */
  it('旧アドレスを返す（通知に使う）', () => {
    expect(body).toMatch(/RETURN v_old_email;/);
  });

  // service role 以外から呼べてはいけない
  it('EXECUTE は service_role だけに与える', () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.change_user_email\(UUID, TEXT\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.change_user_email\(UUID, TEXT\)\s*\n?\s*TO service_role;/,
    );
  });

  // RLS をバイパスしない
  it('SECURITY INVOKER で search_path を固定する', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).toMatch(/SET search_path = public, pg_temp/);
  });

  /**
   * ⚠️ 並行して同じ利用者を更新した場合に、片方が古い値を読んで
   * 消し先を取り違えるのを防ぐ。
   */
  it('行ロックを取ってから進む', () => {
    expect(body).toMatch(/FOR UPDATE/);
  });
});
