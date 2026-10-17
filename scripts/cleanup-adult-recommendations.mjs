/**
 * 既存の recommendations テーブルから adult 作品を除去するクリーンアップスクリプト。
 *
 * 背景: `searchMovies` の adult 除外が入る前に生成されたレコメンドには、
 * アダルト作品が混入している可能性がある（Issue #569）。DBに保存され全ユーザーに
 * 表示されるため、コード修正のデプロイとは別に既存データの除去が必要。
 *
 * 全レコメンドを削除して作り直すと汚染していないユーザーの結果まで壊れるため、
 * TMDb で `adult` を再確認し、該当行だけを削除する。
 *
 * 使い方:
 *   node scripts/cleanup-adult-recommendations.mjs          … 調査のみ（dry-run）
 *   node scripts/cleanup-adult-recommendations.mjs --apply  … adult 行を削除
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
 * recommendations の全行を取得する。
 * Supabase-js / PostgREST は既定で1000行までしか返さないため、
 * Range ヘッダーで明示的にページングする。
 */
async function fetchAllRecommendations() {
  const pageSize = 1000;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/recommendations?select=id,user_id,tmdb_movie_id,title&order=id`,
      {
        headers: {
          ...supabaseHeaders(),
          Range: `${offset}-${offset + pageSize - 1}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `recommendations の取得に失敗しました: ${response.status} ${await response.text()}`,
      );
    }

    const page = await response.json();
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

/**
 * TMDb で映画の adult フラグを確認する。
 * 取得に失敗した場合は判定不能として null を返す（安全側に倒し、削除しない）。
 */
async function fetchIsAdult(tmdbMovieId) {
  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbMovieId}`,
    { headers: { Authorization: `Bearer ${TMDB_API_KEY}` } },
  );

  if (!response.ok) {
    console.warn(`  TMDb 取得失敗 (id=${tmdbMovieId}): ${response.status}`);
    return null;
  }

  const detail = await response.json();
  return detail.adult === true;
}

/** 指定した recommendations 行を削除する */
async function deleteRecommendations(ids) {
  const idList = ids.map((id) => `"${id}"`).join(',');
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/recommendations?id=in.(${idList})`,
    { method: 'DELETE', headers: supabaseHeaders() },
  );

  if (!response.ok) {
    throw new Error(
      `削除に失敗しました: ${response.status} ${await response.text()}`,
    );
  }
}

async function main() {
  assertEnv();

  console.log(
    isApply
      ? '=== adult レコメンド削除モード (--apply) ==='
      : '=== adult レコメンド調査モード (dry-run) ===',
  );

  const rows = await fetchAllRecommendations();
  console.log(`recommendations: ${rows.length} 行`);

  if (rows.length === 0) {
    console.log('対象なし。');
    return;
  }

  // 同じ映画が複数ユーザーに推薦されているため、TMDb 問い合わせはID単位で重複排除する
  const uniqueMovieIds = [...new Set(rows.map((row) => row.tmdb_movie_id))];
  console.log(`ユニークな映画ID: ${uniqueMovieIds.length} 件を TMDb で確認`);

  const adultMovieIds = new Set();
  let checked = 0;
  let unknown = 0;

  for (const movieId of uniqueMovieIds) {
    const isAdult = await fetchIsAdult(movieId);
    checked++;

    if (isAdult === null) {
      unknown++;
    } else if (isAdult) {
      adultMovieIds.add(movieId);
    }

    if (checked % 50 === 0) {
      console.log(`  ${checked}/${uniqueMovieIds.length} 件確認`);
    }

    await sleep(TMDB_REQUEST_INTERVAL_MS);
  }

  const adultRows = rows.filter((row) => adultMovieIds.has(row.tmdb_movie_id));

  console.log('');
  console.log(`adult と判定された映画: ${adultMovieIds.size} 件`);
  console.log(`削除対象の recommendations 行: ${adultRows.length} 行`);
  if (unknown > 0) {
    console.log(`判定不能（TMDb取得失敗）: ${unknown} 件 — 削除対象外`);
  }

  for (const row of adultRows) {
    console.log(`  - ${row.title} (tmdb_movie_id=${row.tmdb_movie_id})`);
  }

  if (adultRows.length === 0) {
    console.log('削除対象なし。');
    return;
  }

  if (!isApply) {
    console.log('');
    console.log('dry-run のため削除していません。--apply で実行してください。');
    return;
  }

  await deleteRecommendations(adultRows.map((row) => row.id));
  console.log('');
  console.log(`${adultRows.length} 行を削除しました。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
