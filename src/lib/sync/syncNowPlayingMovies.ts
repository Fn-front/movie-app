/**
 * TMDb now_playing エンドポイントから映画データを取得し movie_cache に同期する
 */

import { createClient } from '@supabase/supabase-js';

import {
  EXCLUDED_GENRE_IDS,
  NOW_PLAYING_SYNC_MAX_PAGES,
  RELEASE_TYPE,
} from '@/constants/movies';
import { isConcertFilm } from '@/lib/movies/concertFilm';
import { isQualityMovie } from '@/lib/movies/qualityFilter';
import { isStageBroadcast } from '@/lib/movies/stageBroadcast';
import { getNowPlayingMovies, hasExcludedKeyword } from '@/lib/tmdb/tmdb';
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
  /** スキップされた映画数（adult・除外言語・除外キーワード・ライブ興行） */
  skipped: number;
  /** エラーメッセージ */
  errors: string[];
}

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
  for (let page = 1; page <= NOW_PLAYING_SYNC_MAX_PAGES; page++) {
    const response = await getNowPlayingMovies(page);
    if (response.results.length === 0) break;
    allMovies.push(...response.results);
    if (page >= response.total_pages) break;
  }

  result.fetched = allMovies.length;

  // 2. フィルタリング: adult・除外言語・低品質コンテンツ・除外ジャンルを除外
  const excludedGenres: readonly number[] = EXCLUDED_GENRE_IDS;
  const filteredMovies = allMovies.filter((movie) => {
    if (!isQualityMovie(movie)) {
      result.skipped++;
      return false;
    }
    // 除外ジャンル（tmdb.ts の excludeInappropriateMovies との二重防御）
    if ((movie.genre_ids ?? []).some((id) => excludedGenres.includes(id))) {
      result.skipped++;
      return false;
    }
    return true;
  });

  // 3. キーワードフィルタ + UPSERT（順次処理でレート制限対策）
  //
  // 別release_type（streaming）に存在するIDの除外は行わない。
  // movie_cache の PK は (id, release_type) のため DB 側で自然に共存でき、
  // 除外すると「配信済みだが劇場でリバイバル上映中」の作品が公開中タブから
  // 消える。加えて Supabase-js の暗黙1000行制限で除外自体が静かに壊れていた。
  const nowPlayingIds = new Set<number>();
  const now = new Date().toISOString();

  for (const movie of filteredMovies) {
    try {
      // 除外キーワードチェック
      if (await hasExcludedKeyword(movie.id)) {
        result.skipped++;
        continue;
      }

      // ライブビューイング・コンサート映像・舞台中継を保存しない。
      // 同期判定の isStageBroadcast を先に通し、TMDbへの問い合わせを省く
      if (isStageBroadcast(movie) || (await isConcertFilm(movie))) {
        result.skipped++;
        continue;
      }

      nowPlayingIds.add(movie.id);

      // movie_cache に UPSERT
      //
      // 素の upsert ではなく RPC を使う。リバイバル上映作品の release_date は
      // 映画.com側（syncEigaMovies）が持ち主であり、TMDbの原公開日で上書きすると
      // 「リバイバル」バッジのまま公開日が数十年前になるため。
      // 列ごとの条件付き更新は postgrest の upsert では表現できない。
      const { error } = await supabase.rpc('upsert_movie_cache', {
        movies: [
          {
            id: movie.id,
            title: movie.title,
            poster_path: movie.poster_path,
            backdrop_path: movie.backdrop_path,
            release_date: movie.release_date || null,
            overview: movie.overview || null,
            vote_average: movie.vote_average,
            vote_count: movie.vote_count ?? 0,
            popularity: movie.popularity,
            genre_ids: movie.genre_ids,
            release_type: RELEASE_TYPE.THEATRICAL,
            cached_at: now,
          },
        ],
        set_now_playing: true,
      });

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

  // 4. リストから外れた映画の is_now_playing をクリア
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
