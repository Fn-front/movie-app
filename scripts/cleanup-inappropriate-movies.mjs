/**
 * DBに保存済みの不適切コンテンツ（アダルト作品）を除去するクリーンアップスクリプト。
 *
 * 背景:
 * - Issue #569: `adult` フラグの除外が入る前に生成されたレコメンドに混入の可能性
 * - Issue #665: `EXCLUDED_KEYWORD_IDS`（ポルノ・ピンク映画等）は TMDb の
 *   `without_keywords` でしか効かず `/search` 経路に適用されないため、
 *   `adult=false` のままキーワード該当作品が保存されている可能性
 *
 * 全件削除して作り直すと汚染していないデータまで壊れるため、
 * TMDb で `adult` とキーワードを再確認し、該当行だけを削除する。
 *
 * 対象テーブル:
 *   recommendations / award_movies / now_showing_movies
 *
 * 使い方:
 *   node scripts/cleanup-inappropriate-movies.mjs          … 調査のみ（dry-run）
 *   node scripts/cleanup-inappropriate-movies.mjs --apply  … 該当行を削除
 *
 * 必要な環境変数（.env.local から読み込み）:
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TMDB_API_KEY
 */

import process from 'node:process';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

/** TMDb のレート制限（50 req/s）に対する安全マージン */
const TMDB_REQUEST_INTERVAL_MS = 50;

/**
 * 除外キーワードID
 * ※ src/constants/movies.ts の EXCLUDED_KEYWORD_IDS と必ず同期すること
 */
const EXCLUDED_KEYWORD_IDS = [
  155477, // softcore
  190370, // erotic movie
  10053, // sexploitation
  445, // pornography
  260863, // hardcore
  198385, // hentai
  161919, // adult animation
  159551, // pink film
];

/** クリーンアップ対象テーブル */
const TARGET_TABLES = ['recommendations', 'award_movies', 'now_showing_movies'];

const isApply = process.argv.includes('--apply');

/** 必須環境変数を検証する */
function assertEnv() {
  const missing = [
    ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['TMDB_API_KEY', TMDB_API_KEY],
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
 * 指定テーブルの全行を取得する。
 * PostgREST は既定で1000行までしか返さないため Range ヘッダーでページングする。
 */
async function fetchAllRows(table) {
  const pageSize = 1000;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id,tmdb_movie_id,title&order=id`,
      {
        headers: {
          ...supabaseHeaders(),
          Range: `${offset}-${offset + pageSize - 1}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `${table} の取得に失敗しました: ${response.status} ${await response.text()}`,
      );
    }

    const page = await response.json();
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

/** TMDb の共通ヘッダー */
function tmdbHeaders() {
  return { Authorization: `Bearer ${TMDB_API_KEY}` };
}

/**
 * TMDb で映画が不適切コンテンツかを判定する。
 *
 * @returns 'adult' | 'keyword' | 'clean' | 'unknown'
 *          unknown は取得失敗（安全のため削除対象にしない）
 */
async function classifyMovie(tmdbMovieId) {
  try {
    const [detailRes, keywordRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${tmdbMovieId}`, {
        headers: tmdbHeaders(),
      }),
      fetch(`https://api.themoviedb.org/3/movie/${tmdbMovieId}/keywords`, {
        headers: tmdbHeaders(),
      }),
    ]);

    if (!detailRes.ok || !keywordRes.ok) {
      console.warn(
        `  TMDb 取得失敗 (id=${tmdbMovieId}): detail=${detailRes.status} keywords=${keywordRes.status}`,
      );
      return 'unknown';
    }

    const detail = await detailRes.json();
    if (detail.adult === true) return 'adult';

    const keywords = await keywordRes.json();
    const ids = (keywords.keywords ?? []).map((k) => k.id);
    if (ids.some((id) => EXCLUDED_KEYWORD_IDS.includes(id))) return 'keyword';

    return 'clean';
  } catch (error) {
    console.warn(`  TMDb 取得失敗 (id=${tmdbMovieId}): ${error.message}`);
    return 'unknown';
  }
}

/** 指定テーブルの行を削除する */
async function deleteRows(table, ids) {
  const idList = ids.map((id) => `"${id}"`).join(',');
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=in.(${idList})`,
    { method: 'DELETE', headers: supabaseHeaders() },
  );

  if (!response.ok) {
    throw new Error(
      `${table} の削除に失敗しました: ${response.status} ${await response.text()}`,
    );
  }
}

async function main() {
  assertEnv();

  console.log(
    isApply
      ? '=== 不適切コンテンツ削除モード (--apply) ==='
      : '=== 不適切コンテンツ調査モード (dry-run) ===',
  );

  // 1. 全テーブルの行を集め、TMDb 問い合わせはID単位で重複排除する
  const rowsByTable = new Map();
  const allMovieIds = new Set();

  for (const table of TARGET_TABLES) {
    const rows = await fetchAllRows(table);
    rowsByTable.set(table, rows);
    rows.forEach((row) => allMovieIds.add(row.tmdb_movie_id));
    console.log(`${table}: ${rows.length} 行`);
  }

  const uniqueMovieIds = [...allMovieIds];
  console.log(`\nユニークな映画ID: ${uniqueMovieIds.length} 件を TMDb で確認`);

  if (uniqueMovieIds.length === 0) {
    console.log('対象なし。');
    return;
  }

  // 2. 判定
  const verdicts = new Map();
  let checked = 0;
  let unknown = 0;

  for (const movieId of uniqueMovieIds) {
    const verdict = await classifyMovie(movieId);
    verdicts.set(movieId, verdict);
    checked++;
    if (verdict === 'unknown') unknown++;

    if (checked % 50 === 0) {
      console.log(`  ${checked}/${uniqueMovieIds.length} 件確認`);
    }

    await sleep(TMDB_REQUEST_INTERVAL_MS);
  }

  const adultIds = uniqueMovieIds.filter((id) => verdicts.get(id) === 'adult');
  const keywordIds = uniqueMovieIds.filter(
    (id) => verdicts.get(id) === 'keyword',
  );

  console.log('');
  console.log(`adult フラグで該当: ${adultIds.length} 件`);
  console.log(`除外キーワードで該当: ${keywordIds.length} 件`);
  if (unknown > 0) {
    console.log(`判定不能（TMDb取得失敗）: ${unknown} 件 — 削除対象外`);
  }

  // 3. テーブルごとの削除対象を出す
  let totalTargets = 0;

  for (const table of TARGET_TABLES) {
    const targets = rowsByTable
      .get(table)
      .filter((row) =>
        ['adult', 'keyword'].includes(verdicts.get(row.tmdb_movie_id)),
      );

    if (targets.length === 0) continue;

    totalTargets += targets.length;
    console.log(`\n--- ${table}: ${targets.length} 行 ---`);
    for (const row of targets) {
      console.log(
        `  - ${row.title} (tmdb_movie_id=${row.tmdb_movie_id}, ${verdicts.get(row.tmdb_movie_id)})`,
      );
    }

    if (isApply) {
      await deleteRows(
        table,
        targets.map((row) => row.id),
      );
      console.log(`  → ${targets.length} 行を削除しました。`);
    }
  }

  console.log('');
  if (totalTargets === 0) {
    console.log('削除対象なし。');
    return;
  }

  if (!isApply) {
    console.log(
      `削除対象 合計 ${totalTargets} 行。dry-run のため削除していません。--apply で実行してください。`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
