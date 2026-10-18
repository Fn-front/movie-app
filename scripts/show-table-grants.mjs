/**
 * public スキーマの全テーブルについて、ロール別の権限を実測する。
 *
 * 引数にマイグレーションを渡すと、トランザクション内で適用した「適用後」も
 * 表示して ROLLBACK する（DBは変更されない）。
 *
 * 権限は REVOKE / GRANT 文を読むだけでは確認できない。関数の EXECUTE で、
 * PUBLIC だけ剥奪して anon が残る取りこぼしを一度やっている（#701）。
 *
 * 前提:
 *   pg は依存に入れていないため、使うときだけ一時的に入れる。
 *     npm install pg --no-save
 *
 * 使い方:
 *   node scripts/show-table-grants.mjs
 *   node scripts/show-table-grants.mjs supabase/migrations/<file>.sql
 */
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

const poolerUrl = new URL(
  readFileSync('supabase/.temp/pooler-url', 'utf8').trim(),
);
const client = new pg.Client({
  host: poolerUrl.hostname,
  port: Number(poolerUrl.port || 5432),
  user: decodeURIComponent(poolerUrl.username),
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const SQL = `
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls,
    (SELECT count(*) FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
    coalesce((
      SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
      FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = c.relname
        AND g.grantee = 'anon'
    ), '-') AS anon,
    coalesce((
      SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
      FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = c.relname
        AND g.grantee = 'authenticated'
    ), '-') AS authed,
    coalesce((
      SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
      FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = c.relname
        AND g.grantee = 'service_role'
    ), '-') AS svc
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname;
`;

const short = (v) =>
  v === '-'
    ? '-'
    : v
        .split(',')
        .map((p) => p[0] + (p === 'SELECT' ? '' : ''))
        .join('');

async function dump(label) {
  const { rows } = await client.query(SQL);
  console.log(`\n===== ${label} =====`);
  printRows(rows);
}

function printRows(rows) {
  console.log(
    'table'.padEnd(28),
    'RLS'.padEnd(4),
    'pol'.padEnd(4),
    'anon'.padEnd(10),
    'authed'.padEnd(10),
    'service_role',
  );
  for (const r of rows) {
    console.log(
      r.table_name.padEnd(28),
      (r.rls ? 'on' : 'OFF').padEnd(4),
      String(r.policies).padEnd(4),
      short(r.anon).padEnd(10),
      short(r.authed).padEnd(10),
      short(r.svc),
    );
  }
}

const migrationPath = process.argv[2];

await client.connect();
try {
  await dump(migrationPath ? '適用前' : '現在');

  if (migrationPath) {
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(migrationPath, 'utf8'));
      await dump('適用後（この後 ROLLBACK する）');
    } finally {
      await client.query('ROLLBACK');
      console.log('\n↩️  ROLLBACK 完了（DBは変更されていません）');
    }
  }
} finally {
  await client.end();
}

console.log(
  '\n凡例: S=SELECT I=INSERT U=UPDATE D=DELETE T=TRUNCATE R=REFERENCES G=TRIGGER',
);
