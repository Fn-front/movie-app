/**
 * TMDb Discover API から配信（streaming）作品を取得し movie_cache に同期する
 *
 * これまで streaming はリクエスト起点（/api/movies のキャッシュ失効時）でしか
 * 同期されず、失効直後のユーザーが Discover の直列実行を待たされていた。
 * CRON から事前にウォームアップするため、同期処理を関数として切り出している。
 */

import { createClient } from '@supabase/supabase-js';

import {
  ALLOWED_LANGUAGES,
  DISCOVER_API_MAX_PAGES,
  MIN_POPULARITY,
  MIN_VOTE_AVERAGE,
  MOVIES_FETCH_MONTHS_AHEAD,
  NOW_SHOWING_MONTHS_BACK,
  RELEASE_TYPE,
  RELEASE_TYPE_MAP,
} from '@/constants/movies';
import { TMDB_SORT_BY } from '@/constants/tmdb';
import { discoverMovies } from '@/lib/tmdb/tmdb';

/**
 * Streaming 同期結果の型
 */
export interface StreamingSyncResult {
  /** TMDb から取得した映画数 */
  fetched: number;
  /** UPSERT した映画数 */
  upserted: number;
  /** フィルタで除外した映画数 */
  skipped: number;
  /** TMDb API の呼び出し回数 */
  tmdbRequests: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** エラーメッセージ */
  errors: string[];
}

/** 同期対象の time_frame ごとの公開日範囲 */
interface DateWindow {
  /** ログ用のラベル */
  timeFrame: 'upcoming' | 'now_showing';
  /** 公開日の下限（YYYY-MM-DD） */
  gte: string;
  /** 公開日の上限（YYYY-MM-DD） */
  lte: string;
}

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 同期対象の公開日範囲を算出する
 *
 * /api/movies が streaming の各 time_frame で参照する範囲と一致させる。
 */
function buildDateWindows(now: Date): DateWindow[] {
  const today = formatDateToString(now);

  const futureDate = new Date(now);
  futureDate.setMonth(futureDate.getMonth() + MOVIES_FETCH_MONTHS_AHEAD);

  const pastDate = new Date(now);
  pastDate.setMonth(pastDate.getMonth() - NOW_SHOWING_MONTHS_BACK);

  return [
    {
      timeFrame: 'upcoming',
      gte: today,
      lte: formatDateToString(futureDate),
    },
    {
      timeFrame: 'now_showing',
      gte: formatDateToString(pastDate),
      lte: today,
    },
  ];
}

/**
 * TMDb Discover API から配信作品を取得し movie_cache に同期する
 *
 * upcoming / now_showing の両方の公開日範囲を事前生成する。
 * TMDb のレート制限（50 req/s）に配慮し、ページ取得は順次実行する。
 *
 * @returns 同期結果（メトリクス込み）
 */
export async function syncStreamingMovies(): Promise<StreamingSyncResult> {
  const startedAt = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: StreamingSyncResult = {
    fetched: 0,
    upserted: 0,
    skipped: 0,
    tmdbRequests: 0,
    durationMs: 0,
    errors: [],
  };

  // 別release_typeで既に存在するIDを取得（重複防止）
  const { data: existingOtherType } = await supabase
    .from('movie_cache')
    .select('id')
    .neq('release_type', RELEASE_TYPE.STREAMING);

  const existingOtherTypeIds = new Set(
    (existingOtherType ?? []).map((row: { id: number }) => row.id),
  );

  const allowedLangs: readonly string[] = ALLOWED_LANGUAGES;
  const now = new Date();
  const cachedAt = now.toISOString();

  for (const window of buildDateWindows(now)) {
    for (let page = 1; page <= DISCOVER_API_MAX_PAGES; page++) {
      try {
        const response = await discoverMovies({
          page,
          'release_date.gte': window.gte,
          'release_date.lte': window.lte,
          with_release_type: RELEASE_TYPE_MAP[RELEASE_TYPE.STREAMING],
          sort_by: TMDB_SORT_BY.POPULARITY_DESC,
        });
        result.tmdbRequests++;

        if (response.results.length === 0) break;

        result.fetched += response.results.length;

        // adultコンテンツ・除外言語・別release_typeで既存の映画・低品質コンテンツを除外
        const filteredResults = response.results.filter(
          (movie) =>
            !movie.adult &&
            allowedLangs.includes(movie.original_language) &&
            !existingOtherTypeIds.has(movie.id) &&
            movie.genre_ids &&
            movie.genre_ids.length > 0 &&
            (movie.vote_average === 0 ||
              movie.vote_average >= MIN_VOTE_AVERAGE) &&
            movie.popularity >= MIN_POPULARITY,
        );

        result.skipped += response.results.length - filteredResults.length;

        if (filteredResults.length > 0) {
          const movieRows = filteredResults.map((movie) => ({
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
            release_type: RELEASE_TYPE.STREAMING,
            cached_at: cachedAt,
          }));

          const { error } = await supabase
            .from('movie_cache')
            .upsert(movieRows, { onConflict: 'id,release_type' });

          if (error) {
            result.errors.push(
              `${window.timeFrame} page ${page}: ${error.message}`,
            );
          } else {
            result.upserted += movieRows.length;
          }
        }

        if (page >= response.total_pages) break;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`${window.timeFrame} page ${page}: ${message}`);
        // 当該 time_frame の残ページはスキップし、次の time_frame へ進む
        break;
      }
    }
  }

  result.durationMs = Date.now() - startedAt;

  console.log(
    `[sync-streaming] fetched=${result.fetched} upserted=${result.upserted} ` +
      `skipped=${result.skipped} tmdbRequests=${result.tmdbRequests} ` +
      `durationMs=${result.durationMs} errors=${result.errors.length}`,
  );

  return result;
}
