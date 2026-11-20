/**
 * TMDb Discover から公開予定の劇場公開作品を取得し movie_cache に同期する（#1000）
 *
 * ⚠️ **この同期だけは「鮮度の更新」ではなく「新作の発見」**。
 *
 * 他の同期は既にある行を新しくするだけだが、公開予定の劇場公開作品を
 * TMDb から拾ってくる経路はコードベース中ここしかない。止まると一覧が
 * 古くなるのではなく、**新しい作品が入ってこなくなる**。
 *
 *   `updateMoviesCacheByBatch`  … 既存行の更新のみ。新作は追加しない
 *   `syncEigaMovies`            … 映画.com の iCal（日本公開が確定した作品）
 *   `syncNowPlayingMovies`      … 公開中（`is_now_playing`）が対象
 *
 * 元は `/api/movies` のリクエスト処理の中で直列実行していた（#983 で
 * 他2分岐を CRON へ寄せたときに、代替の CRON が無いためここだけ残した）。
 * キャッシュは6時間で失効するので、**1日3回ほど誰かが同期の完了を
 * 待たされていた**。最大5ページの直列 Discover ＋ `isConcertFilm` の
 * 追加問い合わせぶんで、数十秒の桁になる。
 *
 * ⛔ **クリア処理は持たない。** `is_now_playing` のような「今そうである」
 * フラグと違い、公開予定は時間が経てば公開中へ移るだけで、消す対象が無い。
 */

import { createClient } from '@supabase/supabase-js';

import {
  DISCOVER_API_MAX_PAGES,
  MOVIES_FETCH_MONTHS_AHEAD,
  RELEASE_TYPE,
  RELEASE_TYPE_MAP,
} from '@/constants/movies';
import { createItemOutcome, type ItemOutcome } from '@/lib/cron/itemOutcome';
import { isConcertFilm } from '@/lib/movies/concertFilm';
import { isQualityMovie } from '@/lib/movies/qualityFilter';
import { isStageBroadcast } from '@/lib/movies/stageBroadcast';
import { discoverMovies } from '@/lib/tmdb/tmdb';
import { formatDateToString } from '@/utils/date';

/** 公開予定同期の結果 */
export interface UpcomingSyncResult {
  /** TMDb から取得した映画数（フィルタ前） */
  fetched: number;
  /** UPSERT した映画数 */
  upserted: number;
  /** フィルタで除外した映画数（低品質・舞台中継・コンサート映像） */
  skipped: number;
  /** 取得したページ数 */
  pages: number;
  /** エラーメッセージ */
  errors: string[];
  /**
   * 作品単位の集計（#1354）
   *
   * ⚠️ 分母は**取得した件数**ではなく UPSERT に通した件数。フィルタで
   * 落とした分を含めると失敗率が薄まり、全滅を見逃す。
   */
  items: ItemOutcome;
}

/**
 * TMDb Discover から公開予定の劇場公開作品を同期する
 *
 * @returns 同期結果
 */
export async function syncUpcomingMovies(): Promise<UpcomingSyncResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: UpcomingSyncResult = {
    fetched: 0,
    upserted: 0,
    skipped: 0,
    pages: 0,
    errors: [],
    items: createItemOutcome(),
  };

  const now = new Date();
  const today = formatDateToString(now);
  const futureDate = new Date(now);
  futureDate.setMonth(futureDate.getMonth() + MOVIES_FETCH_MONTHS_AHEAD);

  for (let page = 1; page <= DISCOVER_API_MAX_PAGES; page += 1) {
    const response = await discoverMovies({
      page,
      'release_date.gte': today,
      'release_date.lte': formatDateToString(futureDate),
      with_release_type: RELEASE_TYPE_MAP[RELEASE_TYPE.THEATRICAL],
      sort_by: 'popularity.desc',
    });

    result.pages = page;
    result.fetched += response.raw_results_count;

    // ⚠️ 判定は**フィルタ前の件数**で行う（#1166）。`discoverMovies` は
    // `excludeInappropriateMovies` を通した配列を返すため、
    // `results.length === 0` は「ローカルのフィルタで全件落ちた」でも
    // 成立し、そこで打ち切ると以降のページを取りにいかない
    if (response.raw_results_count === 0) break;

    // adultコンテンツ・除外言語・低品質コンテンツを除外
    const qualityResults = response.results.filter((movie) =>
      isQualityMovie(movie),
    );

    // 舞台・演劇の中継を除外する（タイトル判定のみで完結する）
    const stageFiltered = qualityResults.filter(
      (movie) => !isStageBroadcast(movie),
    );

    // ライブビューイング・コンサート映像を除外する。
    // 判定にTMDbへの問い合わせを伴うが、候補はMusic系ジャンルのみの
    // 作品に限られるため1ページあたり数件で済む
    const concertFlags = await Promise.all(
      stageFiltered.map((movie) => isConcertFilm(movie)),
    );
    const filteredResults = stageFiltered.filter(
      (_, index) => !concertFlags[index],
    );

    result.skipped += response.results.length - filteredResults.length;

    // ⚠️ `break` にしない（#1166）。ローカルのフィルタで全件落ちただけで、
    // 次のページには残る作品がありうる。
    //
    // ⚠️ ここで `total_pages` を見ないのは**移設前と同じ**。最終ページが
    // 全件フィルタされると1回ぶん余計に取りにいくが、挙動を変えないために
    // そのまま移した。直すなら別PRで
    if (filteredResults.length === 0) continue;

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
      original_language: movie.original_language,
      release_type: RELEASE_TYPE.THEATRICAL,
      cached_at: now.toISOString(),
    }));

    result.items.attempted += movieRows.length;

    // リバイバル行の release_date を上書きしないため RPC 経由で UPSERT する
    // （set_now_playing は指定せず、既存の is_now_playing を保持する）
    const { error } = await supabase.rpc('upsert_movie_cache', {
      movies: movieRows,
    });

    if (error) {
      // ⚠️ 1ページの失敗で全体を止めない。ただし**作品単位の失敗として
      //    数える**（#1354）。数えないと、全ページ失敗しても 200 で返る
      result.errors.push(`page ${page}: ${error.message}`);
      result.items.failed += movieRows.length;
    } else {
      result.upserted += movieRows.length;
    }

    if (page >= response.total_pages) break;
  }

  console.log(
    `[sync-upcoming] fetched=${result.fetched} upserted=${result.upserted} ` +
      `skipped=${result.skipped} pages=${result.pages}` +
      (result.errors.length ? ` errors=${result.errors.length}` : ''),
  );

  return result;
}
