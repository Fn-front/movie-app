/**
 * movie_cache テーブルの vote_average, popularity をバッチ更新する
 */

import { createClient } from '@supabase/supabase-js';

import { BATCH_UPDATE_SIZE } from '@/constants/movies';
import { hasExcludedGenre } from '@/lib/movies/genreFilter';
import { getMovieCacheStats, isTmdbNotFoundError } from '@/lib/tmdb/tmdb';

/**
 * 映画ID取得時の1ページあたり件数
 * PostgREST の既定上限（1000行）に合わせる
 */
const SELECT_PAGE_SIZE = 1000;

/**
 * バッチ更新結果の型
 */
export interface BatchUpdateResult {
  /** 更新対象の映画数 */
  total: number;
  /** 更新成功数 */
  updated: number;
  /** 除外ジャンルに該当して削除した行数 */
  removed: number;
  /** TMDbから消えていた（404）ため削除した行数 */
  removedNotFound: number;
  /** エラーメッセージ */
  errors: string[];
}

/**
 * movie_cache の全映画に対して TMDb API から最新の vote_average, popularity を取得し更新する
 *
 * @returns バッチ更新結果
 */
export async function updateMoviesCacheByBatch(): Promise<BatchUpdateResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: BatchUpdateResult = {
    total: 0,
    updated: 0,
    removed: 0,
    removedNotFound: 0,
    errors: [],
  };

  // 1. DBからユニークな映画IDを全件取得
  //
  // Supabase-js（PostgREST）は .range() 未指定だと既定1000行で打ち切るため、
  // ページングして全件取得する。打ち切られると取得できなかった行の
  // vote_average / popularity / vote_count が永久に更新されない。
  // ORDER BY 無しの LIMIT/OFFSET は順序が保証されずページ間で重複・欠落が
  // 起きるため、.order() も必須。
  const rows: { id: number; release_type: string }[] = [];

  for (let offset = 0; ; offset += SELECT_PAGE_SIZE) {
    const { data, error: fetchError } = await supabase
      .from('movie_cache')
      .select('id, release_type')
      .order('id', { ascending: true })
      .order('release_type', { ascending: true })
      .range(offset, offset + SELECT_PAGE_SIZE - 1);

    if (fetchError) {
      throw new Error(`映画ID取得エラー: ${fetchError.message}`);
    }

    if (!data || data.length === 0) break;

    rows.push(...(data as { id: number; release_type: string }[]));

    if (data.length < SELECT_PAGE_SIZE) break;
  }

  if (rows.length === 0) {
    return result;
  }

  result.total = rows.length;

  // ユニークなmovie IDを抽出（同一IDが theatrical/streaming で複数行ある場合があるため）
  const uniqueMovieIds = [...new Set(rows.map((row) => row.id as number))];

  // 2. バッチ単位でTMDb APIから最新情報を取得し更新
  for (let i = 0; i < uniqueMovieIds.length; i += BATCH_UPDATE_SIZE) {
    const batchIds = uniqueMovieIds.slice(i, i + BATCH_UPDATE_SIZE);
    const now = new Date().toISOString();

    // バッチ内の各映画を順次処理（レート制限対策）
    for (const movieId of batchIds) {
      try {
        const stats = await getMovieCacheStats(movieId);
        const matchingRowCount = rows.filter(
          (row) => row.id === movieId,
        ).length;

        // TMDbは公開後にジャンルを追加することがあり、保存時点では対象外だった
        // 作品が後から除外ジャンル（テレビ映画等）に該当するようになる。
        // 保存前フィルタ（excludeInappropriateMovies）は保存の瞬間しか効かないため、
        // 毎日全件の詳細を取得しているこの経路で再判定して取り除く。
        // ジャンルは既に取得済みなのでTMDbへの追加リクエストは発生しない
        if (hasExcludedGenre(stats.genreIds)) {
          const { error: deleteError } = await supabase
            .from('movie_cache')
            .delete()
            .eq('id', movieId);

          if (deleteError) {
            result.errors.push(`ID ${movieId}: ${deleteError.message}`);
          } else {
            result.removed += matchingRowCount;
          }
          continue;
        }

        // 同じmovie IDを持つ全行（theatrical/streaming）を更新
        const { error: updateError } = await supabase
          .from('movie_cache')
          .update({
            vote_average: stats.voteAverage,
            vote_count: stats.voteCount,
            popularity: stats.popularity,
            // 地域フィルタが参照する列。全件の詳細をここで毎日取得しているため、
            // 追加のTMDb呼び出し無しに未取得の行が順次埋まる
            original_language: stats.originalLanguage,
            updated_at: now,
          })
          .eq('id', movieId);

        if (updateError) {
          result.errors.push(`ID ${movieId}: ${updateError.message}`);
        } else {
          // 更新された行数をカウント（同じIDで複数行ある場合も考慮）
          result.updated += matchingRowCount;
        }
      } catch (error) {
        // TMDbは映画でないエントリ（ゲームのOP映像、記念映像など）を後から
        // 削除する。消えた作品を残しておくと、詳細を開けないまま一覧に出続け、
        // さらに毎日同じ404エラーを errors に積み続ける。ここで取り除く。
        //
        // 一時障害（429 / 503 / 504）では消さない。リトライ後もなお失敗した
        // ものを消すと、TMDb側の不調だけでキャッシュが削られてしまう。
        if (isTmdbNotFoundError(error)) {
          const matchingRowCount = rows.filter(
            (row) => row.id === movieId,
          ).length;

          const { error: deleteError } = await supabase
            .from('movie_cache')
            .delete()
            .eq('id', movieId);

          if (deleteError) {
            result.errors.push(`ID ${movieId}: ${deleteError.message}`);
          } else {
            result.removedNotFound += matchingRowCount;
          }
          continue;
        }

        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`ID ${movieId}: ${message}`);
      }
    }
  }

  return result;
}
