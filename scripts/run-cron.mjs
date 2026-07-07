/**
 * Cronエンドポイントをローカルで実行するランナー。
 *
 * Vercel Cron（vercel.json の crons）と同じエンドポイントを、
 * ローカルの dev サーバーに対して `Authorization: Bearer ${CRON_SECRET}` 付きで叩く。
 *
 * 使い方:
 *   npm run cron                      … 実行可能なcron一覧を表示
 *   npm run cron -- <name>            … 指定したcronを1件実行
 *   npm run cron -- all               … 全cronを順に実行
 *
 * 事前に dev サーバーを起動しておくこと（例: `npm run dev`）。
 * 接続先は環境変数 CRON_LOCAL_BASE_URL で上書き可能（既定: http://localhost:3000）。
 * 認証には .env.local の CRON_SECRET を使用する。
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/** vercel.json の crons と対応するエンドポイント（name = パス末尾） */
const CRON_ENDPOINTS = [
  'sync-movies',
  'sync-now-playing',
  'update-movies',
  'sync-now-showing',
  'generate-recommendations',
  'sync-award-movies',
];

const BASE_URL = (
  process.env.CRON_LOCAL_BASE_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET;

/** 実行可能なcron一覧を表示する */
function printList() {
  console.log('実行可能なcron:');
  for (const name of CRON_ENDPOINTS) {
    console.log(`  - ${name}`);
  }
  console.log('');
  console.log('使い方:');
  console.log('  npm run cron -- <name>   1件実行');
  console.log('  npm run cron -- all      全件実行（順次）');
}

/** 単一のcronエンドポイントを実行する。成功したら true を返す。 */
async function runOne(name) {
  const url = `${BASE_URL}/api/cron/${name}`;
  process.stdout.write(`▶ ${name} … `);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
  } catch (error) {
    console.log('接続失敗');
    console.error(
      `  dev サーバーに接続できませんでした（${url}）。\n` +
        '  先に `npm run dev` で起動してください。',
    );
    console.error(`  詳細: ${error.message}`);
    return false;
  }

  const text = await res.text();
  let body = text;
  try {
    body = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // JSON以外はそのまま表示
  }

  if (res.ok) {
    console.log(`OK (${res.status})`);
    console.log(body);
    return true;
  }

  console.log(`失敗 (${res.status})`);
  console.log(body);
  return false;
}

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === 'list' || arg === '--help' || arg === '-h') {
    printList();
    return;
  }

  if (!CRON_SECRET) {
    console.error(
      'CRON_SECRET が設定されていません（.env.local を確認してください）。',
    );
    process.exit(1);
  }

  const targets = arg === 'all' ? CRON_ENDPOINTS : [arg];

  // 未知の名前は早期にエラー
  const unknown = targets.filter((t) => !CRON_ENDPOINTS.includes(t));
  if (unknown.length > 0) {
    console.error(`未知のcron: ${unknown.join(', ')}`);
    console.error('');
    printList();
    process.exit(1);
  }

  let allOk = true;
  for (const name of targets) {
    const ok = await runOne(name);
    if (!ok) allOk = false;
  }

  if (!allOk) process.exit(1);
}

main();
