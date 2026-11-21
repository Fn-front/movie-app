/**
 * movie_cache テーブルの指標列・表示列をバッチ更新する
 *
 * TMDb の `/movie/{id}` を全行ぶん毎日叩いているので、そのレスポンスに
 * 含まれる列はすべてここで追従させる（#433）。書き込みは
 * `update_movie_cache_stats` RPC 経由。
 */

import { createItemOutcome, type ItemOutcome } from '@/lib/cron/itemOutcome';
import { createClient } from '@supabase/supabase-js';

import { BATCH_UPDATE_SIZE } from '@/constants/movies';
import { hasExcludedGenre } from '@/lib/movies/genreFilter';
import { getMovieCacheStats, isTmdbNotFoundError } from '@/lib/tmdb/tmdb';
import type { MovieCacheStats } from '@/lib/types';

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
  /**
   * 作品単位の集計（#1354）
   *
   * ⚠️ 分母に `total` を使わないこと。あれは `movie_cache` の**行数**で、
   * ループが回るのは重複を除いた映画IDの数。同一IDが theatrical / streaming の
   * 2行になるため、行数は常に多めに出る。
   */
  items: ItemOutcome;
}

/**
 * `update_movie_cache_stats` RPC へ渡す引数を組み立てる
 *
 * 表示列（title / overview / poster_path / backdrop_path）は行の作成時にしか
 * 書かれていなかった。公開前に登録された作品は後からポスターや邦題が決まっても
 * 反映されず、一覧だけ No Image や英題のまま残っていた（#883）。全件の詳細を
 * ここで毎日取得しているので、追加のTMDb呼び出し無しに追従できる。
 *
 * `genre_ids` / `release_date` も同じレスポンスに含まれているのに書いて
 * いなかったため、この2列だけが凍結していた（#433）。
 *
 * ⚠️ **素の `.update()` ではなく RPC なのは `release_date` のため。**
 * リバイバル行の公開日は映画.com側が持ち主で、`.eq('id', movieId)` だけの
 * UPDATE に足すと `upsert_movie_cache` の保護を毎日迂回する。かといって
 * `.eq('is_revival', false)` を足すと、リバイバル行では他の列の日次更新まで
 * 止まる。列ごとの条件分岐は postgrest で表現できないので DB 側に置いた。
 * 詳細は `20261121160000_add_update_movie_cache_stats_rpc.sql`。
 *
 * @param movieId - 映画ID
 * @param stats - TMDbから取得した同期指標
 * @returns RPC の引数
 */
function buildStatsRpcArgs(movieId: number, stats: MovieCacheStats) {
  return {
    p_id: movieId,
    // ⚠️ 空文字の正規化はここと RPC の両方で行う（二重）。
    //   RPC 側（NULLIF / COALESCE）が本体の防御だが、SQL は jest から
    //   検証できない。ここで潰しておけば「何を渡す約束か」をテストで固定できる
    //
    // title は NOT NULL 制約がある。null を渡すと RPC が既存値を残す
    p_title: stats.title || null,
    // 空文字は「あらすじ無し」として保存経路と同じく null に寄せる
    p_overview: stats.overview || null,
    p_poster_path: stats.posterPath,
    p_backdrop_path: stats.backdropPath,
    p_genre_ids: stats.genreIds,
    // `getMovieCacheStats` が空文字を null に正規化済み
    p_release_date: stats.releaseDate,
    p_vote_average: stats.voteAverage,
    p_vote_count: stats.voteCount,
    p_popularity: stats.popularity,
    p_original_language: stats.originalLanguage,
  };
}

/**
 * movie_cache の全映画に対して TMDb API から最新情報を取得し更新する
 *
 * 更新する列は `buildStatsRpcArgs` を参照。`/movie/{id}` のレスポンスに
 * 含まれるものはすべて追従させる（#433）。
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
    items: createItemOutcome(),
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

    // バッチ内の各映画を順次処理（レート制限対策）
    for (const movieId of batchIds) {
      result.items.attempted++;

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
            result.items.failed++;
          } else {
            result.removed += matchingRowCount;
          }
          continue;
        }

        // 同じmovie IDを持つ全行（theatrical/streaming）を更新
        const { data: updatedRowCount, error: updateError } =
          await supabase.rpc(
            'update_movie_cache_stats',
            buildStatsRpcArgs(movieId, stats),
          );

        if (updateError) {
          result.errors.push(`ID ${movieId}: ${updateError.message}`);
          result.items.failed++;
        } else {
          // ⚠️ SELECT で数えた行数ではなく **RPC が返した ROW_COUNT** を足す。
          //   一覧取得から UPDATE までの間に別経路が行を消していると、
          //   前者は実際より多く出る（0件更新でも成功として数えてしまう）
          result.updated += updatedRowCount ?? 0;
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
            result.items.failed++;
          } else {
            result.removedNotFound += matchingRowCount;
          }
          continue;
        }

        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`ID ${movieId}: ${message}`);
        result.items.failed++;
      }
    }
  }

  return result;
}
