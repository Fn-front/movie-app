/**
 * TMDb now_playing エンドポイントから映画データを取得し movie_cache に同期する
 */

import { createClient } from '@supabase/supabase-js';

import {
  EXCLUDED_GENRE_IDS,
  EXCLUDED_KEYWORD_IDS,
  EXCLUDED_LANGUAGES,
} from '@/constants/movies';
import { getMovieKeywordIds, getNowPlayingMovies } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

/**
 * Now Playing 同期結果の型
 */
export interface NowPlayingSyncResult {
  /** TMDb から取得した映画数 */
  fetched: number;
  /** UPSERT した映画数 */
  upserted: number;
  /** is_now_playing をクリアした映画数 */
  cleared: number;
  /** スキップされた映画数（adult・除外言語・除外キーワード） */
  skipped: number;
  /** エラーメッセージ */
  errors: string[];
}

/** 最大取得ページ数 */
const MAX_PAGES = 10;

/**
 * TMDb now_playing から映画を取得し movie_cache に同期する
 *
 * @returns 同期結果
 */
export async function syncNowPlayingMovies(): Promise<NowPlayingSyncResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: NowPlayingSyncResult = {
    fetched: 0,
    upserted: 0,
    cleared: 0,
    skipped: 0,
    errors: [],
  };

  // 1. TMDb now_playing を全ページ取得
  const allMovies: Movie[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await getNowPlayingMovies(page);
    if (response.results.length === 0) break;
    allMovies.push(...response.results);
    if (page >= response.total_pages) break;
  }

  result.fetched = allMovies.length;

  // 2. フィルタリング: adult・除外言語を除外
  const excludedLangs: readonly string[] = EXCLUDED_LANGUAGES;
  const excludedGenres: readonly number[] = EXCLUDED_GENRE_IDS;
  const filteredMovies = allMovies.filter((movie) => {
    if (movie.adult || excludedLangs.includes(movie.original_language)) {
      result.skipped++;
      return false;
    }
    if (movie.genre_ids?.some((id) => excludedGenres.includes(id))) {
      result.skipped++;
      return false;
    }
    return true;
  });

  // 3. 別release_typeで既に存在するIDを取得（重複防止）
  const { data: existingStreaming } = await supabase
    .from('movie_cache')
    .select('id')
    .neq('release_type', 'theatrical');

  const existingOtherTypeIds = new Set(
    (existingStreaming ?? []).map((row: { id: number }) => row.id),
  );

  // 4. キーワードフィルタ + 重複チェック + UPSERT（順次処理でレート制限対策）
  const nowPlayingIds = new Set<number>();
  const now = new Date().toISOString();

  for (const movie of filteredMovies) {
    try {
      // 別release_typeで既に存在する場合はスキップ
      if (existingOtherTypeIds.has(movie.id)) {
        result.skipped++;
        continue;
      }

      // 除外キーワードチェック
      const keywordIds = await getMovieKeywordIds(movie.id);
      const hasExcludedKeyword = keywordIds.some((id) =>
        (EXCLUDED_KEYWORD_IDS as readonly number[]).includes(id),
      );
      if (hasExcludedKeyword) {
        result.skipped++;
        continue;
      }

      nowPlayingIds.add(movie.id);

      // movie_cache に UPSERT
      const { error } = await supabase.from('movie_cache').upsert(
        {
          id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          release_date: movie.release_date || null,
          overview: movie.overview || null,
          vote_average: movie.vote_average,
          popularity: movie.popularity,
          genre_ids: movie.genre_ids,
          release_type: 'theatrical',
          is_now_playing: true,
          cached_at: now,
        },
        { onConflict: 'id,release_type' },
      );

      if (error) {
        result.errors.push(`${movie.title}: ${error.message}`);
      } else {
        result.upserted++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${movie.title}: ${message}`);
    }
  }

  // 5. リストから外れた映画の is_now_playing をクリア
  const nowPlayingIdsArray = Array.from(nowPlayingIds);
  const { data: clearedData, error: clearError } = await supabase
    .from('movie_cache')
    .update({ is_now_playing: false })
    .eq('is_now_playing', true)
    .eq('release_type', 'theatrical')
    .not('id', 'in', `(${nowPlayingIdsArray.join(',')})`)
    .select('id');

  if (clearError) {
    result.errors.push(`Clear error: ${clearError.message}`);
  } else {
    result.cleared = clearedData?.length ?? 0;
  }

  return result;
}
