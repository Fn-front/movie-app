/**
 * TMDb API クライアント
 */

import {
  API,
  EXCLUDED_GENRE_IDS,
  EXCLUDED_GENRES_PARAM,
  EXCLUDED_KEYWORD_IDS,
  EXCLUDED_KEYWORDS_PARAM,
  PAGINATION,
  TMDB_ENDPOINTS,
  TMDB_MOVIE_DETAIL_APPEND,
  TMDB_JP_COUNTRY_CODE,
  TMDB_RETRY_CONFIG,
  TMDB_THEATRICAL_RELEASE_TYPES,
} from '@/constants';
import type {
  Movie,
  MovieDetail,
  MovieSearchParams,
  TMDbReleaseDateCountry,
  TMDbResponse,
} from '@/lib/types';

import axios, { type AxiosError } from 'axios';

/**
 * TMDb API Read Access Token
 */
const TMDB_ACCESS_TOKEN = process.env.TMDB_API_KEY;

if (!TMDB_ACCESS_TOKEN) {
  throw new Error('TMDB_API_KEY is not defined');
}

/**
 * TMDb専用Axiosインスタンス
 */
const tmdbClient = axios.create({
  baseURL: API.TMDB_BASE_URL,
  headers: {
    Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
  },
  params: {
    language: API.TMDB_LANGUAGE,
    region: API.TMDB_REGION,
    // 全エンドポイント共通でアダルト作品を除外する（新規関数で付け忘れないよう既定値化）
    include_adult: false,
  },
});

/**
 * リトライ可能なエラー時の自動リトライインターセプター
 * - 429: レート制限超過
 * - 503: サービス一時停止
 * - 504: タイムアウト
 */
tmdbClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config;
  const status = error.response?.status;

  if (
    !config ||
    !status ||
    !TMDB_RETRY_CONFIG.RETRYABLE_STATUS_CODES.includes(status)
  ) {
    return Promise.reject(error);
  }

  const retryCount = (config as { __retryCount?: number }).__retryCount ?? 0;

  if (retryCount >= TMDB_RETRY_CONFIG.MAX_RETRY_COUNT) {
    return Promise.reject(error);
  }

  (config as { __retryCount?: number }).__retryCount = retryCount + 1;

  const retryAfter = error.response?.headers?.['retry-after'];
  const delay = retryAfter
    ? Number(retryAfter) * 1000
    : TMDB_RETRY_CONFIG.RETRY_DELAY_MS;

  await new Promise((resolve) => setTimeout(resolve, delay));

  return tmdbClient(config);
});

/**
 * ページ番号のバリデーション（TMDb APIは1〜500のみ有効）
 */
function validatePage(page: number): number {
  return Math.max(1, Math.min(page, PAGINATION.MAX_PAGE));
}

/**
 * 不適切コンテンツを結果側から除外する
 *
 * TMDbの `without_keywords` / `without_genres` は `/discover/movie` でしか
 * サポートされないため、`/search/movie` や `/movie/now_playing` では
 * APIパラメータで足切りできない。
 * そこで取得後の結果に対して `adult` フラグと除外ジャンルを一律で弾き、
 * `include_adult=false` との二重防御とする。
 *
 * @param movies - TMDbから取得した映画リスト
 * @returns 不適切コンテンツを除いた映画リスト
 */
function excludeInappropriateMovies(movies: Movie[]): Movie[] {
  const excludedGenres: readonly number[] = EXCLUDED_GENRE_IDS;

  return movies.filter(
    (movie) =>
      !movie.adult &&
      !(movie.genre_ids ?? []).some((id) => excludedGenres.includes(id)),
  );
}

/**
 * 上映中の映画を取得
 *
 * @param page - ページ番号
 * @returns 上映中の映画リスト（不適切コンテンツ除外済み）
 */
export async function getNowPlayingMovies(
  page: number = 1,
): Promise<TMDbResponse<Movie>> {
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.NOW_PLAYING,
    {
      params: { page: validatePage(page) },
    },
  );
  return {
    ...response.data,
    results: excludeInappropriateMovies(response.data.results),
  };
}

/**
 * 映画詳細を取得
 *
 * @param movieId - 映画ID
 * @returns 映画詳細
 */
export async function getMovieDetail(
  movieId: number | string,
): Promise<MovieDetail> {
  const response = await tmdbClient.get<MovieDetail>(
    TMDB_ENDPOINTS.MOVIE_DETAIL(movieId),
    { params: { append_to_response: TMDB_MOVIE_DETAIL_APPEND } },
  );
  return response.data;
}

/**
 * 映画のキーワード一覧を取得
 *
 * @param movieId - 映画ID
 * @param options - リクエストオプション（中断シグナル）
 * @returns キーワードID配列
 */
export async function getMovieKeywordIds(
  movieId: number | string,
  options?: { signal?: AbortSignal },
): Promise<number[]> {
  const response = await tmdbClient.get<{
    id: number;
    keywords: { id: number; name: string }[];
  }>(TMDB_ENDPOINTS.MOVIE_KEYWORDS(movieId), { signal: options?.signal });
  return response.data.keywords.map((k) => k.id);
}

/**
 * 映画が除外キーワード（アダルト系）を含むかを判定する
 *
 * アダルト判定の実体は `EXCLUDED_KEYWORD_IDS` だが、TMDbの `without_keywords` は
 * `/discover/movie` でしかサポートされないため、`/search/movie` 経由で取得した
 * 映画はこの関数で1件ずつ判定する必要がある。
 * `excludeInappropriateMovies` が見ている `adult` フラグだけでは、
 * `adult=false` のままポルノ・ピンク映画キーワードを持つ作品を弾けない。
 *
 * 取得に失敗した場合は**例外をそのまま投げる**。呼び出し側はいずれも
 * try/catch で当該映画をスキップする実装になっており、判定できない映画を
 * 採用しない（fail-closed）。ここで握りつぶすと、同期処理側の
 * エラー記録（`result.errors`）が失われるため意図的に catch していない。
 *
 * @param movieId - 映画ID
 * @param options - リクエストオプション（中断シグナル）
 * @returns 除外対象なら true
 * @throws TMDbへの問い合わせに失敗した場合
 */
export async function hasExcludedKeyword(
  movieId: number | string,
  options?: { signal?: AbortSignal },
): Promise<boolean> {
  const keywordIds = await getMovieKeywordIds(movieId, options);
  return keywordIds.some((id) =>
    (EXCLUDED_KEYWORD_IDS as readonly number[]).includes(id),
  );
}

/**
 * 映画を検索
 *
 * `include_adult=false` はtmdbClientの既定パラメータで常に送られる。
 * 検索エンドポイントはキーワード・ジャンル除外に非対応のため、
 * 結果側でも不適切コンテンツを除外する。
 *
 * @param params - 検索パラメータ
 * @param options - リクエストオプション（中断シグナル）
 * @returns 検索結果（不適切コンテンツ除外済み）
 */
export async function searchMovies(
  params: MovieSearchParams,
  options?: { signal?: AbortSignal },
): Promise<TMDbResponse<Movie>> {
  const { query, page = 1, year, genre } = params;

  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.SEARCH,
    {
      params: {
        query,
        page: validatePage(page),
        year,
        with_genres: genre,
      },
      signal: options?.signal,
    },
  );
  return {
    ...response.data,
    results: excludeInappropriateMovies(response.data.results),
  };
}

/**
 * Discoverパラメータ型
 */
export interface DiscoverMoviesParams {
  /** ページ番号 */
  page?: number;
  /** 地域別公開日範囲（開始） */
  'release_date.gte'?: string;
  /** 地域別公開日範囲（終了） */
  'release_date.lte'?: string;
  /** リリースタイプ（例: '2|3' で劇場公開のみ） */
  with_release_type?: string;
  /** ソート順 */
  sort_by?: string;
  /** 除外するキーワードID（パイプ区切り） */
  without_keywords?: string;
  /** 除外するジャンルID（パイプ区切り） */
  without_genres?: string;
  /** ジャンルIDフィルター（カンマ区切り） */
  with_genres?: string;
  /** 公開年フィルター */
  primary_release_year?: number;
  /** 最低評価フィルター */
  'vote_average.gte'?: number;
}

/**
 * 映画をDiscoverで取得（公開日範囲指定対応）
 *
 * 除外キーワード・除外ジャンルは既定で付与されるため、呼び出し側で
 * 毎回指定する必要はない（明示的に渡した場合はそちらが優先される）。
 *
 * @param params - Discoverパラメータ
 * @returns 映画リスト（不適切コンテンツ除外済み）
 */
export async function discoverMovies(
  params: DiscoverMoviesParams = {},
): Promise<TMDbResponse<Movie>> {
  const { page = 1, ...rest } = params;
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.DISCOVER,
    {
      params: {
        page: validatePage(page),
        without_keywords: EXCLUDED_KEYWORDS_PARAM,
        without_genres: EXCLUDED_GENRES_PARAM,
        ...rest,
      },
    },
  );
  return {
    ...response.data,
    results: excludeInappropriateMovies(response.data.results),
  };
}

/**
 * ジャンル一覧を取得
 *
 * @returns ジャンル一覧
 */
export async function getGenres() {
  const response = await tmdbClient.get(TMDB_ENDPOINTS.GENRES);
  return response.data.genres;
}

/**
 * 映画のリリース日情報を取得（国別リリースタイプ判定用）
 *
 * @param movieId - 映画ID
 * @returns 国別リリース日情報
 */
export async function getMovieReleaseDates(
  movieId: number,
): Promise<TMDbReleaseDateCountry[]> {
  const response = await tmdbClient.get<{
    id: number;
    results: TMDbReleaseDateCountry[];
  }>(TMDB_ENDPOINTS.MOVIE_RELEASE_DATES(movieId));
  return response.data.results;
}

/**
 * 日本の劇場公開日一覧を取得する（昇順）
 *
 * リリースタイプのうち劇場公開にあたる 2（限定公開）/ 3（劇場公開）だけを拾う。
 * `/movie/{id}` の `release_date` は region 指定でも**プレミア（type 1）**が
 * 代表日になることがあり、「過去に劇場公開されたか」の判定には使えない。
 *
 * @param movieId - 映画ID
 * @returns YYYY-MM-DD の配列（昇順）。日本のリリース情報が無ければ空配列
 */
export async function getJpTheatricalReleaseDates(
  movieId: number,
): Promise<string[]> {
  const countries = await getMovieReleaseDates(movieId);
  const japan = countries.find(
    (country) => country.iso_3166_1 === TMDB_JP_COUNTRY_CODE,
  );

  return (japan?.release_dates ?? [])
    .filter((release) =>
      (TMDB_THEATRICAL_RELEASE_TYPES as readonly number[]).includes(
        release.type,
      ),
    )
    .map((release) => release.release_date.slice(0, 10))
    .sort();
}
