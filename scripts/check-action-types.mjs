/**
 * chk_action_type の許可リストが TS の RateLimitActionType を全て受け付けるかを
 * トランザクション内で実測する（最後に必ず ROLLBACK）。
 *
 * 許可リスト漏れは #546 / #659 で2度、レート制限を無言で無効化している。
 * DROP → ADD の全量再定義方式なので、既存値の書き写し漏れも同じ事故になる。
 */
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

const migrationPath = process.argv[2];

/** src/constants/rateLimit.ts と src/constants/otp.ts から実際の値を抜く */
function collectActionTypes() {
  const rl = readFileSync('src/constants/rateLimit.ts', 'utf8');
  const block = rl.slice(
    rl.indexOf('export const RATE_LIMIT_ACTION'),
    rl.indexOf('} as const', rl.indexOf('export const RATE_LIMIT_ACTION')),
  );
  const values = [...block.matchAll(/:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  // RateLimitActionType に直書きされている OTP_ACTION の3値
  return [...values, 'registration', 'login', 'password_change'];
}

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

const actionTypes = collectActionTypes();

await client.connect();
await client.query('BEGIN');

let ng = 0;
try {
  if (migrationPath) {
    await client.query(readFileSync(migrationPath, 'utf8'));
    console.log(`マイグレーション適用（ロールバック予定）: ${migrationPath}\n`);
  }

  for (const action of actionTypes) {
    await client.query('SAVEPOINT s');
    try {
      await client.query(
        `INSERT INTO rate_limits (identifier, action_type, attempts, last_attempt_at)
         VALUES ('__dryrun__', $1, 1, now())`,
        [action],
      );
      console.log(`✅ ${action}`);
    } catch (e) {
      ng += 1;
      console.log(
        `❌ ${action}  ${e.code === '23514' ? '許可リストに無い（この制限は無言で無効化される）' : e.message.slice(0, 60)}`,
      );
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT s');
    }
  }
} finally {
  await client.query('ROLLBACK');
  await client.end();
}

console.log(
  `\n検査: ${actionTypes.length}件 / ${ng === 0 ? '✅ 全て許可リストに含まれる' : `❌ ${ng}件 漏れ`}`,
);
process.exit(ng === 0 ? 0 : 1);
