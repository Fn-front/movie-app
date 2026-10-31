/**
 * TMDb Discover API から配信（streaming）作品を取得し movie_cache に同期する
 *
 * これまで streaming はリクエスト起点（/api/movies のキャッシュ失効時）でしか
 * 同期されず、失効直後のユーザーが Discover の直列実行を待たされていた。
 * CRON から事前にウォームアップするため、同期処理を関数として切り出している。
 *
 * Discover の `with_release_type=4` は「どこかの国でデジタル公開された」しか
 * 意味しないため、各候補について `watch/providers` の JP を確認し、
 * 日本での配信可否（is_currently_streaming）とデジタル公開日
 * （digital_release_date）を併せて保存する。
 */

import { createClient } from '@supabase/supabase-js';

import {
  DISCOVER_API_MAX_PAGES,
  MOVIES_FETCH_MONTHS_AHEAD,
  NOW_SHOWING_MONTHS_BACK,
  RELEASE_TYPE,
  RELEASE_TYPE_MAP,
  STREAMING_MIN_POPULARITY,
  type WatchProviderOfferType,
} from '@/constants/movies';
import { TMDB_AVAILABILITY_CONCURRENCY, TMDB_SORT_BY } from '@/constants/tmdb';
import { isConcertFilm } from '@/lib/movies/concertFilm';
import { isQualityMovie } from '@/lib/movies/qualityFilter';
import { isStageBroadcast } from '@/lib/movies/stageBroadcast';
import { isFightEvent } from '@/lib/movies/fightEvent';
import { discoverMovies, getJpStreamingAvailability } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

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
  /** 日本で配信中と判定した映画数 */
  availableInJp: number;
  /** is_currently_streaming をクリアした映画数（配信終了） */
  cleared: number;
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

/** JP配信実態を付与した同期対象 */
interface StreamingCandidate {
  /** TMDb の映画データ */
  movie: Movie;
  /** 日本で現在配信中か */
  isCurrentlyStreaming: boolean;
  /** 日本のデジタル公開日（YYYY-MM-DD）。情報が無ければ null */
  digitalReleaseDate: string | null;
  /** 提供形態ごとのプロバイダーID（代表IDへ正規化済み） */
  watchProviderIds: Record<WatchProviderOfferType, number[]>;
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
 * 配列を指定サイズのチャンクに分割する
 */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * TMDb Discover API から配信作品の候補を取得する
 *
 * upcoming / now_showing の両方の公開日範囲を走査する。
 * 両範囲に同じ作品が現れることがあるため、ID で重複を排除する
 * （後続の watch/providers 呼び出しを無駄に増やさないため）。
 *
 * @param windows - 走査する公開日範囲
 * @param result - メトリクスの記録先（呼び出し側と共有）
 * @returns 重複排除済みの候補映画
 */
async function fetchStreamingCandidates(
  windows: DateWindow[],
  result: StreamingSyncResult,
): Promise<Movie[]> {
  const candidates = new Map<number, Movie>();

  for (const window of windows) {
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

        for (const movie of response.results) {
          // 配信カタログは旧作が多く popularity が下がりやすいため、
          // 人気度の閾値だけ streaming 用に緩める
          if (
            !isQualityMovie(movie, { minPopularity: STREAMING_MIN_POPULARITY })
          ) {
            result.skipped++;
            continue;
          }
          candidates.set(movie.id, movie);
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

  // ライブビューイング・コンサート映像・舞台中継を候補から除く。
  // 重複排除のあとに判定することで、同じ作品へのTMDb問い合わせを1回に抑える。
  // 同期判定の isStageBroadcast を先に通し、問い合わせ対象をさらに減らす
  const uniqueCandidates = Array.from(candidates.values());
  const stageFiltered = uniqueCandidates.filter(
    (movie) => !isStageBroadcast(movie),
  );
  const concertFlags = await Promise.all(
    stageFiltered.map((movie) => isConcertFilm(movie)),
  );
  const filtered = stageFiltered.filter((_, index) => !concertFlags[index]);
  result.skipped += uniqueCandidates.length - filtered.length;

  return filtered;
}

/**
 * 候補ごとに日本での配信実態を問い合わせる
 *
 * 問い合わせに失敗した作品は同期対象から外す。false にフォールバックすると、
 * TMDbの一時障害だけで配信中の作品が一斉に配信終了扱いになるため。
 * 失敗した作品のIDは `unresolvedIds` に積み、配信終了フラグのクリア対象からも
 * 除外して既存の値を保持する。
 *
 * @param movies - 候補映画
 * @param result - メトリクスの記録先（呼び出し側と共有）
 * @param unresolvedIds - 判定できなかった映画IDの記録先
 * @returns JP配信実態を付与した同期対象
 */
async function resolveJpAvailability(
  movies: Movie[],
  result: StreamingSyncResult,
  unresolvedIds: Set<number>,
): Promise<StreamingCandidate[]> {
  const resolved: StreamingCandidate[] = [];

  // TMDb のレート制限（50 req/s）に収めるため、同時実行数を絞って順に流す
  for (const batch of chunk(movies, TMDB_AVAILABILITY_CONCURRENCY)) {
    const settled = await Promise.all(
      batch.map(async (movie) => {
        try {
          const availability = await getJpStreamingAvailability(movie.id);
          return { movie, availability, error: null as string | null };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          return { movie, availability: null, error: message };
        }
      }),
    );
    result.tmdbRequests += batch.length;

    for (const { movie, availability, error } of settled) {
      if (!availability) {
        unresolvedIds.add(movie.id);
        result.errors.push(`availability ${movie.title}: ${error}`);
        continue;
      }

      // 格闘技・プロレスの興行（試合そのものの配信）は映画ではないため
      // 保存しない。ジャンルでは劇映画と区別が付かず候補を絞れないが、
      // 判定に使うキーワードは配信実態と同じリクエストで取得済みのため
      // 追加コールは無い
      if (isFightEvent(availability.keywordIds, movie.title)) {
        result.skipped++;
        continue;
      }

      if (availability.isCurrentlyStreaming) result.availableInJp++;

      resolved.push({
        movie,
        isCurrentlyStreaming: availability.isCurrentlyStreaming,
        digitalReleaseDate: availability.digitalReleaseDate,
        watchProviderIds: availability.watchProviderIds,
      });
    }
  }

  return resolved;
}

/**
 * TMDb Discover API から配信作品を取得し movie_cache に同期する
 *
 * upcoming / now_showing の両方の公開日範囲を事前生成する。
 * TMDb のレート制限（50 req/s）に配慮し、ページ取得は順次、
 * 配信実態の問い合わせは同時実行数を絞って行う。
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
    availableInJp: 0,
    cleared: 0,
    tmdbRequests: 0,
    durationMs: 0,
    errors: [],
  };

  // 別release_type（theatrical）に存在するIDの除外は行わない。
  // movie_cache の PK は (id, release_type) のため DB 側で自然に共存でき、
  // 除外すると「劇場公開後に配信化された作品」が配信タブに一生出なくなる。
  const now = new Date();
  const cachedAt = now.toISOString();

  const candidates = await fetchStreamingCandidates(
    buildDateWindows(now),
    result,
  );

  const unresolvedIds = new Set<number>();
  const resolved = await resolveJpAvailability(
    candidates,
    result,
    unresolvedIds,
  );

  const streamingIds = new Set<number>();

  for (const batch of chunk(resolved, TMDB_AVAILABILITY_CONCURRENCY)) {
    const movieRows = batch.map(
      ({
        movie,
        isCurrentlyStreaming,
        digitalReleaseDate,
        watchProviderIds,
      }) => ({
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
        original_language: movie.original_language,
        release_type: RELEASE_TYPE.STREAMING,
        is_currently_streaming: isCurrentlyStreaming,
        digital_release_date: digitalReleaseDate,
        watch_provider_flatrate: watchProviderIds.flatrate,
        watch_provider_rent: watchProviderIds.rent,
        watch_provider_buy: watchProviderIds.buy,
        cached_at: cachedAt,
      }),
    );

    const { error } = await supabase
      .from('movie_cache')
      .upsert(movieRows, { onConflict: 'id,release_type' });

    if (error) {
      result.errors.push(`upsert: ${error.message}`);
      continue;
    }

    result.upserted += movieRows.length;
    for (const { movie, isCurrentlyStreaming } of batch) {
      if (isCurrentlyStreaming) streamingIds.add(movie.id);
    }
  }

  // 今回「配信中」と確認できなかった既存行のフラグを落とす（配信終了の反映）。
  //
  // 1件も配信中を確認できなかった場合はクリアしない。TMDb 障害やキー失効で
  // 一覧全体が空になるのを避けるため、異常時は既存の表示を維持する。
  if (streamingIds.size > 0) {
    // 判定に失敗した作品は現状維持にしたいので、保持対象に含める
    const keepIds = [...streamingIds, ...unresolvedIds];
    const { data: clearedData, error: clearError } = await supabase
      .from('movie_cache')
      .update({ is_currently_streaming: false })
      .eq('is_currently_streaming', true)
      .eq('release_type', RELEASE_TYPE.STREAMING)
      .not('id', 'in', `(${keepIds.join(',')})`)
      .select('id');

    if (clearError) {
      result.errors.push(`clear: ${clearError.message}`);
    } else {
      result.cleared = clearedData?.length ?? 0;
    }
  }

  result.durationMs = Date.now() - startedAt;

  console.log(
    `[sync-streaming] fetched=${result.fetched} upserted=${result.upserted} ` +
      `skipped=${result.skipped} availableInJp=${result.availableInJp} ` +
      `cleared=${result.cleared} tmdbRequests=${result.tmdbRequests} ` +
      `durationMs=${result.durationMs} errors=${result.errors.length}`,
  );

  return result;
}
