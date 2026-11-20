/**
 * @jest-environment node
 */

/**
 * アカウント削除のDB側の不変条件（#932）
 *
 * ⚠️ **SQL は jest から実行できないので、書いてあることを読んで固定する。**
 *
 * ここが無いと、`delete_user_account` の中身を書き換えても単体テストは
 * 1件も落ちない（レビュー前の実測で3つの変異がすべて生き残った）。
 * 消し漏れも、削除を阻む FK の復活も、気づくのは本番で退会が失敗した
 * ときになる。
 */

import fs from 'fs';
import path from 'path';

// --- Helpers ---

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/** `delete_user_account` を定義している最新のマイグレーションを読む */
function readDeletionMigration(): string {
  const file = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) =>
      /CREATE OR REPLACE FUNCTION public\.delete_user_account/.test(
        fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'),
      ),
    )
    .sort()
    .pop();

  // 落ちたら: 関数の定義が見つからない。作り直したならここも追従させる
  expect(file).toBeDefined();

  return fs.readFileSync(path.join(MIGRATIONS_DIR, file!), 'utf8');
}

/**
 * `users(id)` を参照している FK の削除時の動作を集める
 *
 * ⚠️ **宣言のしかたが2通りある。** `ADD CONSTRAINT` だけを見ると
 * **1本も拾えない** —— 元の FK はすべて `CREATE TABLE` の中に
 * インラインで書かれている（最初に書いたとき実際に空振りした）。
 *
 * マイグレーションを**古い順に**適用して `(テーブル, カラム)` 単位で
 * 上書きする。後から `ALTER TABLE ... ADD CONSTRAINT` で張り替えた分が
 * 最終状態になる。
 */
function collectUserReferences(): { key: string; onDelete: string }[] {
  const refs = new Map<string, string>();

  for (const name of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    if (!name.endsWith('.sql')) continue;

    const sql = fs
      .readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8')
      .replace(/--[^\n]*/g, '');

    // 1. CREATE TABLE の中のインライン宣言
    for (const table of sql.matchAll(
      /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/g,
    )) {
      for (const column of table[2].matchAll(
        /(\w+)\s+[\w()]+[^,]*?REFERENCES\s+(?:public\.)?users\s*\([^)]*\)\s*ON DELETE (\w+(?: \w+)?)/gi,
      )) {
        refs.set(`${table[1]}.${column[1]}`, column[2].toUpperCase());
      }
    }

    // 2. あとから張り替えた分
    for (const altered of sql.matchAll(
      /ALTER TABLE\s+(?:public\.)?(\w+)\s+ADD CONSTRAINT\s+\w+\s+FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(?:public\.)?users\s*\([^)]*\)\s*ON DELETE (\w+(?: \w+)?)/gi,
    )) {
      refs.set(`${altered[1]}.${altered[2]}`, altered[3].toUpperCase());
    }
  }

  return [...refs].map(([key, onDelete]) => ({ key, onDelete }));
}

// --- Tests ---

describe('delete_user_account', () => {
  const sql = readDeletionMigration();

  /**
   * ⚠️ **`rate_limits` は CASCADE に乗らない。**
   *
   * `user_id` を持たず identifier 文字列で引くため、ここで明示的に消さないと
   * 退会後も行が残る。識別子は3つの形を取る。
   */
  it('rate_limits を利用者IDとメールアドレスの両方で消す', () => {
    const body = sql.replace(/--[^\n]*/g, '');

    expect(body).toMatch(/DELETE FROM rate_limits/);
    expect(body).toMatch(/identifier = p_user_id::text/);
    expect(body).toMatch(/identifier = v_email/);
  });

  /**
   * ⛔ **`LIKE` を使わない。**
   *
   * ログイン系の識別子は `メールアドレス|IP`（`buildLoginIdentifier`）なので
   * 前方一致が要る。しかしメールアドレスには `_` や `%` が入りうる
   * （`a_b@example.com` は正当なアドレス）。`LIKE v_email || '|%'` だと
   * `_` が任意1文字として働き、**他人の行まで消す**。
   *
   * `starts_with()` はパターンを解釈しないので安全。
   */
  it('前方一致は starts_with で行う（LIKE を使わない）', () => {
    const body = sql.replace(/--[^\n]*/g, '');

    expect(body).toMatch(/starts_with\(identifier, v_email \|\| '\|'\)/);
    expect(body).not.toMatch(/identifier\s+LIKE/i);
  });

  /**
   * ⚠️ 分けて実行すると、`rate_limits` だけ消えて `users` の削除が失敗した
   * ときに**まだ存在するアカウントの制限が解除された状態**で残る。
   */
  it('同じ関数の中で users も消す', () => {
    expect(sql).toMatch(/DELETE FROM users WHERE id = p_user_id/);
  });

  // service role 以外から呼べてはいけない
  it('EXECUTE は service_role だけに与える', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.delete_user_account\(UUID\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.delete_user_account\(UUID\)\s*\n?\s*TO service_role;/,
    );
  });

  // RLS をバイパスしない
  it('SECURITY INVOKER で search_path を固定する', () => {
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
  });
});

describe('users を参照する FK', () => {
  /**
   * ⚠️ **`ON DELETE RESTRICT` が1本でもあると物理削除が失敗する。**
   *
   * 元は `admin_audit_logs.actor_user_id` と `award_sync_jobs.requested_by`
   * の2本が RESTRICT で、管理操作を行ったアカウントは退会できなかった。
   * `SET NULL` に変えて「誰が」は失うが「操作があった事実」は残している。
   *
   * ⛔ 戻すと退会が失敗するが、**失敗するのは該当者だけ**なので
   * 普通のテストでは気づけない。
   */
  it('削除を阻む RESTRICT が残っていない', () => {
    const restricted = collectUserReferences().filter(
      (ref) => ref.onDelete === 'RESTRICT',
    );

    // 落ちたら: その FK を SET NULL か CASCADE にする。
    // RESTRICT のままだと該当行を持つ利用者が退会できない
    expect(restricted).toEqual([]);
  });

  /**
   * ⚠️ 走査が空振りしていたら上のテストは無意味になる。
   *
   * Issue が数えた本数（18本）を下限にする。宣言のしかたを取りこぼすと
   * ここで気づける。
   */
  it('FK を実際に走査できている', () => {
    expect(collectUserReferences().length).toBeGreaterThanOrEqual(18);
  });
});
