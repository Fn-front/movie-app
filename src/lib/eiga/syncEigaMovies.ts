/**
 * 映画.com iCalフィードとTMDb APIを照合してmovie_cacheに補完する
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { RELEASE_TYPE } from '@/constants/movies';
import { EIGA_SCORING } from '@/constants/eiga';
import { MS_PER_DAY } from '@/constants/time';
import { isConcertFilm } from '@/lib/movies/concertFilm';
import {
  isQualityMovie,
  type QualityFilterOptions,
} from '@/lib/movies/qualityFilter';
import { isStageBroadcast } from '@/lib/movies/stageBroadcast';
import {
  getJpTheatricalReleaseDates,
  hasExcludedKeyword,
  searchMovies,
} from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

import { fetchEigaMovies, fetchOriginalTitle, type EigaMovie } from './eiga';

/**
 * iCal経由の品質フィルタ設定
 *
 * 映画.comのフィードに載る時点で日本公開が確定しているため、
 * 言語・ジャンル・評価・人気度では絞らない（adult除外のみ適用される）
 */
const EIGA_QUALITY_FILTER_OPTIONS: QualityFilterOptions = {
  requireLanguage: false,
  requireGenres: false,
  requireVoteAverage: false,
  requirePopularity: false,
};

/**
 * 同期結果の型
 */
export interface SyncResult {
  /** 処理した映画数 */
  processed: number;
  /** 新規追加された映画数 */
  added: number;
  /** 既存行のリバイバル補正を行った映画数 */
  revivalCorrected: number;
  /** スキップされた映画数（補正不要の既存 or マッチなし） */
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

  // 除外フィルタ適用（iCal経由は日本公開確定のため adult 以外では絞らない）
  const filtered = candidates.filter((movie) =>
    isQualityMovie(movie, EIGA_QUALITY_FILTER_OPTIONS),
  );

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
      const daysDiff = Math.abs(eigaDate - movieDate) / MS_PER_DAY;
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
 * 「過去に日本で劇場公開された作品が再上映される」ことをリバイバルとみなし、
 * iCalの上映日より3ヶ月以上前の**劇場公開**（TMDbのリリースタイプ 2/3）が
 * あるかどうかで判定する。
 *
 * 以前は `/movie/{id}` の `release_date` との日数差で判定していたが、
 * region 指定でもプレミア（タイプ1）が代表日になることがあり、
 * 「映画祭プレミアの約1年後に劇場公開される新作」をリバイバルと誤判定していた。
 *
 * 日本の劇場公開情報が無い場合は false を返す。過去の劇場公開を確認できない
 * 以上「再上映」とは言えないため、主張する側に証拠を求める（fail-closed）。
 *
 * @param jpTheatricalReleaseDates - 日本の劇場公開日（YYYY-MM-DD、昇順）
 * @param eigaReleaseDate - iCalの上映日（YYYY-MM-DD）
 * @returns リバイバル上映ならtrue
 */
export function isRevival(
  jpTheatricalReleaseDates: string[],
  eigaReleaseDate: string,
): boolean {
  const eigaDate = new Date(eigaReleaseDate).getTime();

  return jpTheatricalReleaseDates.some((releaseDate) => {
    const diffDays = (eigaDate - new Date(releaseDate).getTime()) / MS_PER_DAY;
    return diffDays >= EIGA_SCORING.REVIVAL_THRESHOLD_DAYS;
  });
}

/**
 * 既存ID問い合わせの1回あたりID数
 *
 * `.in()` はIDをURLクエリに展開するため、長すぎるURLにならないよう分割する。
 */
const EXISTING_ID_CHUNK_SIZE = 200;

/**
 * リバイバル補正の要否を判定するために必要な既存行の列
 */
interface ExistingTheatricalRow {
  /** 保存済みの公開日（YYYY-MM-DD） */
  release_date: string | null;
  /** リバイバル上映として保存済みか */
  is_revival: boolean;
}

/**
 * 指定したTMDb IDのうち、theatrical として既に movie_cache にある行を返す
 *
 * 全件SELECTだと PostgREST の暗黙1000行制限にかかるため、候補のIDだけを問い合わせる。
 * 取得に失敗した場合は例外を投げる（握りつぶすと全件が「未登録」扱いになり、
 * 無駄なTMDb呼び出しとUPSERTが大量に走るため）。
 *
 * ID だけでなく release_date / is_revival も取るのは、既存行がリバイバル補正済みか
 * を見て TMDb への再問い合わせを省くため。
 *
 * @param supabase - Supabaseクライアント
 * @param movieIds - 問い合わせ対象のTMDb ID
 * @returns TMDb ID をキーとした既存行のMap
 */
async function fetchExistingTheatricalRows(
  supabase: SupabaseClient,
  movieIds: number[],
): Promise<Map<number, ExistingTheatricalRow>> {
  const uniqueIds = [...new Set(movieIds)];
  const existing = new Map<number, ExistingTheatricalRow>();

  for (let i = 0; i < uniqueIds.length; i += EXISTING_ID_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + EXISTING_ID_CHUNK_SIZE);

    const { data, error } = await supabase
      .from('movie_cache')
      .select('id, release_date, is_revival')
      .eq('release_type', RELEASE_TYPE.THEATRICAL)
      .in('id', chunk);

    if (error) {
      throw new Error(`既存ID取得エラー: ${error.message}`);
    }

    for (const row of data ?? []) {
      const { id, release_date, is_revival } = row as {
        id: number;
        release_date: string | null;
        is_revival: boolean;
      };
      existing.set(id, { release_date, is_revival });
    }
  }

  return existing;
}

/**
 * 既存行をリバイバル上映として補正する
 *
 * `/api/movies` の Discover 経由で先に保存された行は、TMDbの代表公開日
 * （多くは初公開日）を持つ。TMDbの `release_date.gte` は「いずれかの
 * リリースレコード」で一致するため、再上映を控えた旧作が公開予定の
 * Discover にヒットするが、保存されるのは代表日のままになる。
 * その結果、同じ `/api/movies` が後段の `release_date >= today` で
 * 自分の保存した行を弾き、公開予定タブに出てこない。
 *
 * 日本の劇場公開日の持ち主は映画.com 側（このモジュール）なので、ここで
 * iCalの上映日に寄せ直す。更新対象を2列に限るのは、他の列の持ち主
 * （TMDbの評価・人気度など）を侵さないため。
 *
 * @param supabase - Supabaseクライアント
 * @param movieId - TMDb ID
 * @param eigaReleaseDate - iCalの上映日（YYYY-MM-DD）
 * @returns 更新に失敗した場合はエラーメッセージ、成功した場合はnull
 */
async function correctRevivalRow(
  supabase: SupabaseClient,
  movieId: number,
  eigaReleaseDate: string,
): Promise<string | null> {
  const { error } = await supabase
    .from('movie_cache')
    .update({
      release_date: eigaReleaseDate,
      is_revival: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', movieId)
    .eq('release_type', RELEASE_TYPE.THEATRICAL);

  return error ? error.message : null;
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
    revivalCorrected: 0,
    skipped: 0,
    errors: [],
  };

  // 2. 各映画をTMDb検索して候補を確定する
  //    重複判定には TMDb ID が必要なため、検索は既存・新規を問わず必ず走る
  const candidates: { eigaMovie: EigaMovie; movie: Movie }[] = [];

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

      candidates.push({ eigaMovie, movie: bestMatch });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${eigaMovie.title}: ${message}`);
    }
  }

  // 3. 候補のIDだけで既存行を問い合わせる
  //    movie_cache 全件を SELECT すると PostgREST の暗黙1000行制限にかかり、
  //    取得できなかった行が「未登録」と誤判定される（無駄なTMDb呼び出しとUPSERTが発生）。
  //    候補は iCal の件数（高々数百）なので、ID指定なら上限の影響を受けない。
  const existingRows = await fetchExistingTheatricalRows(
    supabase,
    candidates.map((candidate) => candidate.movie.id),
  );

  const now = new Date().toISOString();

  // 4. 新規の候補は post-filter を通して UPSERT し、既存行はリバイバル補正だけ行う
  const processedIds = new Set<number>();

  for (const { eigaMovie, movie } of candidates) {
    try {
      // 同じ映画が複数エントリにマッチした場合は最初の1件だけ処理する
      if (processedIds.has(movie.id)) {
        result.skipped++;
        continue;
      }
      processedIds.add(movie.id);

      const existingRow = existingRows.get(movie.id);

      if (existingRow) {
        // 既存行で触るのはリバイバル補正だけ。他の列は別経路の持ち主に任せる
        const alreadyCorrected =
          existingRow.is_revival &&
          existingRow.release_date === eigaMovie.releaseDate;

        if (alreadyCorrected) {
          result.skipped++;
          continue;
        }

        const jpDates = await getJpTheatricalReleaseDates(movie.id);
        if (!isRevival(jpDates, eigaMovie.releaseDate)) {
          result.skipped++;
          continue;
        }

        const updateError = await correctRevivalRow(
          supabase,
          movie.id,
          eigaMovie.releaseDate,
        );

        if (updateError) {
          result.errors.push(`${eigaMovie.title}: ${updateError}`);
        } else {
          result.revivalCorrected++;
        }
        continue;
      }

      // post-filter: adultコンテンツを保存しない（iCal経由は言語フィルタなし）
      if (!isQualityMovie(movie, EIGA_QUALITY_FILTER_OPTIONS)) {
        result.skipped++;
        continue;
      }

      // post-filter: 除外キーワードを含む映画を保存しない
      if (await hasExcludedKeyword(movie.id)) {
        result.skipped++;
        continue;
      }

      // post-filter: ライブビューイング・コンサート映像・舞台中継を保存しない。
      // 同期判定の isStageBroadcast を先に通し、TMDbへの問い合わせを省く
      if (isStageBroadcast(movie) || (await isConcertFilm(movie))) {
        result.skipped++;
        continue;
      }

      // リバイバル上映判定
      // 代表公開日ではなく日本の劇場公開履歴で判定する（プレミア日との誤判定を防ぐ）
      const jpTheatricalDates = await getJpTheatricalReleaseDates(movie.id);
      const revival = isRevival(jpTheatricalDates, eigaMovie.releaseDate);
      const releaseDate = revival
        ? eigaMovie.releaseDate
        : movie.release_date || null;

      // movie_cacheにupsert
      const { error } = await supabase.from('movie_cache').upsert(
        {
          id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          release_date: releaseDate,
          overview: movie.overview || null,
          vote_average: movie.vote_average,
          vote_count: movie.vote_count ?? 0,
          popularity: movie.popularity,
          genre_ids: movie.genre_ids,
          release_type: RELEASE_TYPE.THEATRICAL,
          is_revival: revival,
          cached_at: now,
        },
        { onConflict: 'id,release_type' },
      );

      if (error) {
        result.errors.push(`${eigaMovie.title}: ${error.message}`);
        continue;
      }

      result.added++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${eigaMovie.title}: ${message}`);
    }
  }

  return result;
}
