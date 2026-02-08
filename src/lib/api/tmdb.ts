/**
 * TMDb API クライアント
 */

import { API, PAGINATION, TMDB_ENDPOINTS } from '@/constants';
import type {
  Movie,
  MovieDetail,
  MovieSearchParams,
  TMDbResponse,
} from '@/lib/types';

import axios, { type AxiosError } from 'axios';

/**
 * TMDb API Read Access Token
 */
const TMDB_ACCESS_TOKEN = process.env.NEXT_PUBLIC_TMDB_API_KEY;

if (!TMDB_ACCESS_TOKEN) {
  throw new Error('NEXT_PUBLIC_TMDB_API_KEY is not defined');
}

/** リトライ最大回数 */
const MAX_RETRY_COUNT = 3;

/** リトライ待機時間（ミリ秒） */
const RETRY_DELAY = 1000;

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
  },
});

/** リトライ対象のHTTPステータスコード */
const RETRYABLE_STATUS_CODES = [429, 503, 504];

/**
 * リトライ可能なエラー時の自動リトライインターセプター
 * - 429: レート制限超過
 * - 503: サービス一時停止
 * - 504: タイムアウト
 */
tmdbClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config;
  const status = error.response?.status;

  if (!config || !status || !RETRYABLE_STATUS_CODES.includes(status)) {
    return Promise.reject(error);
  }

  const retryCount = (config as { __retryCount?: number }).__retryCount ?? 0;

  if (retryCount >= MAX_RETRY_COUNT) {
    return Promise.reject(error);
  }

  (config as { __retryCount?: number }).__retryCount = retryCount + 1;

  const retryAfter = error.response?.headers?.['retry-after'];
  const delay = retryAfter ? Number(retryAfter) * 1000 : RETRY_DELAY;

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
 * 人気映画を取得
 *
 * @param page - ページ番号
 * @returns 人気映画リスト
 */
export async function getPopularMovies(
  page: number = 1,
): Promise<TMDbResponse<Movie>> {
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.POPULAR,
    {
      params: { page: validatePage(page) },
    },
  );
  return response.data;
}

/**
 * 最新映画を取得
 *
 * @param page - ページ番号
 * @returns 最新映画リスト
 */
export async function getUpcomingMovies(
  page: number = 1,
): Promise<TMDbResponse<Movie>> {
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.UPCOMING,
    {
      params: { page: validatePage(page) },
    },
  );
  return response.data;
}

/**
 * 上映中の映画を取得
 *
 * @param page - ページ番号
 * @returns 上映中の映画リスト
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
  return response.data;
}

/**
 * 高評価映画を取得
 *
 * @param page - ページ番号
 * @returns 高評価映画リスト
 */
export async function getTopRatedMovies(
  page: number = 1,
): Promise<TMDbResponse<Movie>> {
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.TOP_RATED,
    {
      params: { page: validatePage(page) },
    },
  );
  return response.data;
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
  );
  return response.data;
}

/**
 * 映画を検索
 *
 * @param params - 検索パラメータ
 * @returns 検索結果
 */
export async function searchMovies(
  params: MovieSearchParams,
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
    },
  );
  return response.data;
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
 * ジャンル別映画を取得
 *
 * @param genreId - ジャンルID
 * @param page - ページ番号
 * @returns ジャンル別映画リスト
 */
export async function getMoviesByGenre(
  genreId: number,
  page: number = 1,
): Promise<TMDbResponse<Movie>> {
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.DISCOVER,
    {
      params: {
        with_genres: genreId,
        page: validatePage(page),
        sort_by: 'popularity.desc',
      },
    },
  );
  return response.data;
}
