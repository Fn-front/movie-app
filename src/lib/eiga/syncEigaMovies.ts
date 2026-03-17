/**
 * 映画.com iCalフィードとTMDb APIを照合してmovie_cacheに補完する
 */

import { createClient } from '@supabase/supabase-js';

import { EXCLUDED_KEYWORD_IDS } from '@/constants/movies';
import { EIGA_SCORING } from '@/constants/eiga';
import { getMovieKeywordIds, searchMovies } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

import { fetchEigaMovies, fetchOriginalTitle, type EigaMovie } from './eiga';

/**
 * 同期結果の型
 */
export interface SyncResult {
  /** 処理した映画数 */
  processed: number;
  /** 新規追加された映画数 */
  added: number;
  /** スキップされた映画数（既存 or マッチなし） */
  skipped: number;
  /** エラーが発生した映画タイトル */
  errors: string[];
}

/**
 * TMDb検索結果から最適な映画を選定する
 *
 * @param candidates - TMDb検索結果の映画配列
 * @param eigaMovie - iCalから取得した映画情報
 * @param originalTitle - 原題（フォールバック検索時に指定）
 * @returns ベストマッチの映画、またはnull
 */
export function findBestMatch(
  candidates: Movie[],
  eigaMovie: EigaMovie,
  originalTitle?: string,
): Movie | null {
  if (candidates.length === 0) return null;

  // 除外フィルタ適用（iCal経由は日本公開確定のため言語フィルタなし）
  const filtered = candidates.filter((movie) => !movie.adult);

  if (filtered.length === 0) return null;

  const eigaDate = new Date(eigaMovie.releaseDate).getTime();

  // タイトル一致 + 公開日の近さでスコアリング
  let bestMovie: Movie | null = null;
  let bestScore = -Infinity;

  for (const movie of filtered) {
    let score = 0;

    // 邦題完全一致ボーナス
    if (movie.title === eigaMovie.title) {
      score += EIGA_SCORING.TITLE_MATCH_BONUS;
    }

    // 原題一致ボーナス（フォールバック検索時）
    if (
      originalTitle &&
      movie.original_title.toLowerCase() === originalTitle.toLowerCase()
    ) {
      score += EIGA_SCORING.TITLE_MATCH_BONUS;
    }

    // 公開日の近さ（差分が小さいほど高スコア）
    if (movie.release_date) {
      const movieDate = new Date(movie.release_date).getTime();
      const daysDiff = Math.abs(eigaDate - movieDate) / (1000 * 60 * 60 * 24);
      // 30日以内なら加点、それ以上は減点
      score += Math.max(0, EIGA_SCORING.DATE_PROXIMITY_BASE - daysDiff);
    }

    // 人気度ボーナス（同スコア時の差別化）
    score += movie.popularity * EIGA_SCORING.POPULARITY_WEIGHT;

    if (score > bestScore) {
      bestScore = score;
      bestMovie = movie;
    }
  }

  // タイトルが完全一致しない場合は最低限のスコア閾値を設ける
  if (bestMovie && bestScore < EIGA_SCORING.MIN_MATCH_SCORE) {
    return null;
  }

  return bestMovie;
}


/**
 * リバイバル上映かどうかを判定する
 *
 * TMDbの公開日がiCalの日付より3ヶ月以上前ならリバイバルとみなす。
 *
 * @param tmdbReleaseDate - TMDbの公開日（YYYY-MM-DD）
 * @param eigaReleaseDate - iCalの公開日（YYYY-MM-DD）
 * @returns リバイバル上映ならtrue
 */
export function isRevival(
  tmdbReleaseDate: string | null,
  eigaReleaseDate: string,
): boolean {
  if (!tmdbReleaseDate) return false;

  const tmdbDate = new Date(tmdbReleaseDate).getTime();
  const eigaDate = new Date(eigaReleaseDate).getTime();
  const diffDays = (eigaDate - tmdbDate) / (1000 * 60 * 60 * 24);

  return diffDays >= EIGA_SCORING.REVIVAL_THRESHOLD_DAYS;
}

/**
 * 映画.com iCalフィードからTMDb検索してmovie_cacheに補完する
 *
 * @returns 同期結果
 */
export async function syncEigaMovies(): Promise<SyncResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. iCalから映画リストを取得
  const eigaMovies = await fetchEigaMovies();

  const result: SyncResult = {
    processed: eigaMovies.length,
    added: 0,
    skipped: 0,
    errors: [],
  };

  // 2. 既存のmovie_cache IDを取得（重複チェック用）
  const { data: existingRows } = await supabase
    .from('movie_cache')
    .select('id, release_type');

  const existingIds = new Set(
    (existingRows ?? []).map(
      (row: { id: number; release_type: string }) =>
        `${row.id}_${row.release_type}`,
    ),
  );

  const now = new Date().toISOString();

  // 3. 各映画をTMDb検索してマッチング
  for (const eigaMovie of eigaMovies) {
    try {
      // TMDb検索（順次実行でレート制限対策）
      const searchResult = await searchMovies({
        query: eigaMovie.title,
      });

      let bestMatch = findBestMatch(searchResult.results, eigaMovie);

      // 邦題でマッチしなかった場合、映画.comから原題を取得して再検索
      if (!bestMatch && eigaMovie.eigaUrl) {
        const originalTitle = await fetchOriginalTitle(eigaMovie.eigaUrl);
        if (originalTitle) {
          const retryResult = await searchMovies({
            query: originalTitle,
          });
          bestMatch = findBestMatch(
            retryResult.results,
            eigaMovie,
            originalTitle,
          );
        }
      }

      if (!bestMatch) {
        result.skipped++;
        continue;
      }

      // 劇場公開として登録（映画.comは劇場公開映画が対象）
      const cacheKey = `${bestMatch.id}_theatrical`;
      if (existingIds.has(cacheKey)) {
        result.skipped++;
        continue;
      }

      // post-filter: adultコンテンツを保存しない（iCal経由は言語フィルタなし）
      if (bestMatch.adult) {
        result.skipped++;
        continue;
      }

      // post-filter: 除外キーワードを含む映画を保存しない
      const keywordIds = await getMovieKeywordIds(bestMatch.id);
      const hasExcludedKeyword = keywordIds.some((id) =>
        (EXCLUDED_KEYWORD_IDS as readonly number[]).includes(id),
      );
      if (hasExcludedKeyword) {
        result.skipped++;
        continue;
      }

      // リバイバル上映判定
      const revival = isRevival(bestMatch.release_date, eigaMovie.releaseDate);
      const releaseDate = revival
        ? eigaMovie.releaseDate
        : bestMatch.release_date || null;

      // movie_cacheにupsert
      const { error } = await supabase.from('movie_cache').upsert(
        {
          id: bestMatch.id,
          title: bestMatch.title,
          poster_path: bestMatch.poster_path,
          backdrop_path: bestMatch.backdrop_path,
          release_date: releaseDate,
          overview: bestMatch.overview || null,
          vote_average: bestMatch.vote_average,
          popularity: bestMatch.popularity,
          genre_ids: bestMatch.genre_ids,
          release_type: 'theatrical',
          is_revival: revival,
          cached_at: now,
        },
        { onConflict: 'id,release_type' },
      );

      if (error) {
        result.errors.push(`${eigaMovie.title}: ${error.message}`);
        continue;
      }

      existingIds.add(cacheKey);
      result.added++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${eigaMovie.title}: ${message}`);
    }
  }

  return result;
}
