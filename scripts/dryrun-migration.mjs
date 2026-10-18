/**
 * マイグレーションのドライラン（トランザクション内で実行し必ず ROLLBACK する）
 *
 * `supabase db push --dry-run` は「どのファイルを送るか」を一覧するだけで SQL を
 * 実行しないため、構文エラーも GRANT の付け忘れも検出できない。
 * ここでは実際に実行したうえで権限の最終状態を確認し、ROLLBACK で元に戻す。
 *
 * 権限は REVOKE 文を読むだけでは確認できない。実際にこのスクリプトで、
 * `REVOKE ... FROM PUBLIC` だけでは Supabase が anon / authenticated へ
 * 付与している EXECUTE が残ることが分かった（適用前に検出できた）。
 *
 * 前提:
 *   pg は依存に入れていないため、使うときだけ一時的に入れる。
 *     npm install pg --no-save
 *   接続情報は .env.local の SUPABASE_DB_PASSWORD と、Supabase CLI が link 時に
 *   保存する supabase/.temp/pooler-url を使う（事前に `npx supabase link` が必要）。
 *
 * 使い方:
 *   node scripts/dryrun-migration.mjs supabase/migrations/<file>.sql
 */

import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';

// シェルで source せずに済ませる（認証情報をコマンドラインに出さないため）
dotenv.config({ path: '.env.local', quiet: true });

const migrationPath = process.argv[2];
if (!migrationPath) {
  console.error('使い方: node dryrun-migration.mjs <migration.sql>');
  process.exit(1);
}

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(
  '.',
)[0];
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error('SUPABASE_DB_PASSWORD が未設定です');
  process.exit(1);
}

/** 対象の関数（マイグレーションが触るもの） */
const FUNCTIONS = [
  'consume_rate_limit',
  'upsert_recommendations',
  'upsert_movie_cache',
  'sync_now_showing_movies',
  'get_watchlist_by_proximity',
  'delete_expired_recommendation_events',
  'get_award_years',
  'update_updated_at_column',
];

const INSPECT_SQL = `
  SELECT
    p.proname                                        AS name,
    pg_get_function_identity_arguments(p.oid)        AS args,
    p.prosecdef                                      AS security_definer,
    coalesce(array_to_string(p.proconfig, ', '), '-') AS config,
    coalesce(array_to_string(p.proacl, E'\\n'), '(default: PUBLIC)') AS acl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY($1)
  ORDER BY p.proname;
`;

async function inspect(client, label) {
  const { rows } = await client.query(INSPECT_SQL, [FUNCTIONS]);
  console.log(`\n===== ${label} =====`);
  for (const r of rows) {
    console.log(`\n■ ${r.name}(${r.args})`);
    console.log(
      `   SECURITY  : ${r.security_definer ? 'DEFINER ⚠️' : 'INVOKER'}`,
    );
    console.log(`   config    : ${r.config}`);
    console.log(`   EXECUTE   : ${r.acl.replace(/\n/g, '\n               ')}`);
  }
  return rows;
}

// 接続先は Supabase CLI が link 時に保存した pooler URL を使う
// （リージョンのプレフィックスが aws-0 / aws-1 で異なるため推測しない）
const poolerUrl = new URL(
  readFileSync('supabase/.temp/pooler-url', 'utf8').trim(),
);

const client = new pg.Client({
  host: poolerUrl.hostname,
  port: Number(poolerUrl.port || 5432),
  user: decodeURIComponent(poolerUrl.username) || `postgres.${ref}`,
  password,
  database: poolerUrl.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60_000,
});

let exitCode = 0;
try {
  await client.connect();
  console.log('接続OK');

  await inspect(client, '適用前');

  await client.query('BEGIN');
  try {
    await client.query(readFileSync(migrationPath, 'utf8'));
    console.log(
      '\n✅ マイグレーションSQLの実行に成功（構文・シグネチャともOK）',
    );
    await inspect(client, '適用後（この後 ROLLBACK する）');
  } finally {
    await client.query('ROLLBACK');
    console.log('\n↩️  ROLLBACK 完了（DBは変更されていません）');
  }
} catch (error) {
  exitCode = 1;
  console.error('\n❌ 失敗:', error.message);
  if (error.position) console.error('   position:', error.position);
} finally {
  await client.end();
}
process.exit(exitCode);
