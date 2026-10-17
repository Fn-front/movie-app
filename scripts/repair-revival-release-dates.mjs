/**
 * 上書きされたリバイバル作品の公開日を修復するスクリプト（Issue #668）
 *
 * 背景: 日次の now-playing CRON が `is_revival=true` の行の `release_date` を
 * TMDb の原公開日で上書きしていたため、「リバイバル」バッジのまま公開日が
 * 数十年前になっている行が残っている。
 *
 * RPC 化（upsert_movie_cache）により今後の上書きは止まるが、既に壊れた行は
 * 自動では直らない（syncEigaMovies は既存行をスキップするため）。
 *
 * 修復手順:
 *   1. `is_revival=true` の行を全件取得
 *   2. TMDb の原公開日と比較し、一致する行を「上書きされた」と判定
 *      （本来のリバイバル行は映画.comの上映日が90日以上後にあるため一致しない）
 *   3. 映画.com の iCal フィードから正しい上映日を引き当てて復元
 *   4. フィードに無い行（上映終了済み等）は復元できないため、
 *      `is_revival=false` にしてバッジと日付の矛盾を解消する
 *
 * 使い方:
 *   node scripts/repair-revival-release-dates.mjs          … 調査のみ（dry-run）
 *   node scripts/repair-revival-release-dates.mjs --apply  … 修復を実行
 *
 * 必要な環境変数（.env.local から読み込み）:
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TMDB_API_KEY / EIGA_ICAL_URL
 */

import process from 'node:process';

import dotenv from 'dotenv';
import ICAL from 'ical.js';

dotenv.config({ path: '.env.local', quiet: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const EIGA_ICAL_URL = process.env.EIGA_ICAL_URL;

/** TMDb のレート制限（50 req/s）に対する安全マージン */
const TMDB_REQUEST_INTERVAL_MS = 50;

const isApply = process.argv.includes('--apply');

/** 必須環境変数を検証する */
function assertEnv() {
  const missing = [
    ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['TMDB_API_KEY', TMDB_API_KEY],
    ['EIGA_ICAL_URL', EIGA_ICAL_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error(`環境変数が未設定です: ${missing.join(', ')}`);
    process.exit(1);
  }
}

/** 指定ミリ秒待機する */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Supabase REST API の共通ヘッダー */
function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * is_revival=true の行を全件取得する。
 * PostgREST は既定で1000行までのため Range ヘッダーでページングする。
 */
async function fetchRevivalRows() {
  const pageSize = 1000;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/movie_cache?is_revival=eq.true&release_type=eq.theatrical&select=id,title,release_date&order=id`,
      {
        headers: {
          ...supabaseHeaders(),
          Range: `${offset}-${offset + pageSize - 1}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `movie_cache の取得に失敗しました: ${response.status} ${await response.text()}`,
      );
    }

    const page = await response.json();
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

/** TMDb の原公開日を取得する（失敗時は null） */
async function fetchTmdbReleaseDate(movieId) {
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}?language=ja-JP&region=JP`,
      { headers: { Authorization: `Bearer ${TMDB_API_KEY}` } },
    );
    if (!response.ok) return null;

    const detail = await response.json();
    return detail.release_date || null;
  } catch {
    return null;
  }
}

/**
 * 映画.com の iCal フィードから「タイトル → 上映日」のマップを作る
 *
 * 本番の同期ロジック（src/lib/eiga/eiga.ts の parseIcal）と同じ ical.js で
 * パースする。復元できる範囲での救済が目的で、フィードに無い作品は対象外。
 */
async function fetchEigaReleaseDates() {
  const response = await fetch(EIGA_ICAL_URL);
  if (!response.ok) {
    console.warn(`映画.com フィードの取得に失敗: ${response.status}`);
    return new Map();
  }

  const component = new ICAL.Component(ICAL.parse(await response.text()));
  const map = new Map();

  for (const vevent of component.getAllSubcomponents('vevent')) {
    const summary = new ICAL.Event(vevent).summary;
    const dtstart = vevent.getFirstPropertyValue('dtstart');
    if (!summary || !dtstart) continue;

    const month = String(dtstart.month).padStart(2, '0');
    const day = String(dtstart.day).padStart(2, '0');
    map.set(summary, `${dtstart.year}-${month}-${day}`);
  }

  return map;
}

/** 1行を更新する */
async function updateRow(id, payload) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/movie_cache?id=eq.${id}&release_type=eq.theatrical`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(
      `id=${id} の更新に失敗しました: ${response.status} ${await response.text()}`,
    );
  }
}

async function main() {
  assertEnv();

  console.log(
    isApply ? '=== 修復モード (--apply) ===' : '=== 調査モード (dry-run) ===',
  );

  const rows = await fetchRevivalRows();
  console.log(`is_revival=true の theatrical 行: ${rows.length} 件`);

  if (rows.length === 0) {
    console.log('対象なし。');
    return;
  }

  const eigaDates = await fetchEigaReleaseDates();
  console.log(`映画.com フィードの件数: ${eigaDates.size}\n`);

  const recoverable = [];
  const unrecoverable = [];
  let checked = 0;

  for (const row of rows) {
    const tmdbDate = await fetchTmdbReleaseDate(row.id);
    checked++;

    if (checked % 50 === 0) {
      console.log(`  ${checked}/${rows.length} 件確認`);
    }
    await sleep(TMDB_REQUEST_INTERVAL_MS);

    // TMDbの原公開日と一致 ＝ now-playing CRON に上書きされた行
    if (!tmdbDate || row.release_date !== tmdbDate) continue;

    const eigaDate = eigaDates.get(row.title);
    if (eigaDate && eigaDate !== tmdbDate) {
      recoverable.push({ ...row, tmdbDate, eigaDate });
    } else {
      unrecoverable.push({ ...row, tmdbDate });
    }
  }

  console.log('');
  console.log(
    `上書きされていた行: ${recoverable.length + unrecoverable.length} 件`,
  );
  console.log(`  映画.comから復元可能: ${recoverable.length} 件`);
  console.log(`  復元不可（フィードに無い）: ${unrecoverable.length} 件`);

  for (const row of recoverable) {
    console.log(
      `  [復元] ${row.title} (id=${row.id}) ${row.release_date} → ${row.eigaDate}`,
    );
  }
  for (const row of unrecoverable) {
    console.log(
      `  [is_revival解除] ${row.title} (id=${row.id}) release_date=${row.release_date}`,
    );
  }

  if (recoverable.length === 0 && unrecoverable.length === 0) {
    console.log('\n修復対象なし。');
    return;
  }

  if (!isApply) {
    console.log(
      '\ndry-run のため更新していません。--apply で実行してください。',
    );
    return;
  }

  for (const row of recoverable) {
    await updateRow(row.id, { release_date: row.eigaDate });
  }
  for (const row of unrecoverable) {
    // 日付を復元できない以上、バッジだけ残すとユーザーに矛盾が見える
    await updateRow(row.id, { is_revival: false });
  }

  console.log('');
  console.log(
    `${recoverable.length} 件の公開日を復元し、${unrecoverable.length} 件の is_revival を解除しました。`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
