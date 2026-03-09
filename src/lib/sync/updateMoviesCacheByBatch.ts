/**
 * movie_cache テーブルの vote_average, popularity をバッチ更新する
 */

import { createClient } from '@supabase/supabase-js';

import { BATCH_UPDATE_SIZE } from '@/constants/movies';
import { getMovieDetail } from '@/lib/tmdb/tmdb';

/**
 * バッチ更新結果の型
 */
export interface BatchUpdateResult {
  /** 更新対象の映画数 */
  total: number;
  /** 更新成功数 */
  updated: number;
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
    errors: [],
  };

  // 1. DBからユニークな映画IDを全件取得
  const { data: rows, error: fetchError } = await supabase
    .from('movie_cache')
    .select('id, release_type');

  if (fetchError) {
    throw new Error(`映画ID取得エラー: ${fetchError.message}`);
  }

  if (!rows || rows.length === 0) {
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
        const detail = await getMovieDetail(movieId);

        // 同じmovie IDを持つ全行（theatrical/streaming）を更新
        const { error: updateError } = await supabase
          .from('movie_cache')
          .update({
            vote_average: detail.vote_average,
            popularity: detail.popularity,
            updated_at: now,
          })
          .eq('id', movieId);

        if (updateError) {
          result.errors.push(`ID ${movieId}: ${updateError.message}`);
        } else {
          // 更新された行数をカウント（同じIDで複数行ある場合も考慮）
          const matchingRows = rows.filter((row) => row.id === movieId);
          result.updated += matchingRows.length;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`ID ${movieId}: ${message}`);
      }
    }
  }

  return result;
}
