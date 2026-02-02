/**
 * TMDb API クライアント
 */

import { API } from '@/constants';
import type {
  Movie,
  MovieDetail,
  MovieSearchParams,
  TMDbResponse,
} from '@/lib/types';

import { axiosInstance } from './axios';

/**
 * TMDb APIキー
 */
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

if (!TMDB_API_KEY) {
  throw new Error('NEXT_PUBLIC_TMDB_API_KEY is not defined');
}

/**
 * TMDb専用Axiosインスタンス
 */
const tmdbClient = axiosInstance.create({
  baseURL: API.TMDB_BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
    language: 'ja-JP',
    region: 'JP',
  },
});

/**
 * 人気映画を取得
 *
 * @param page - ページ番号
 * @returns 人気映画リスト
 */
export async function getPopularMovies(
  page: number = 1,
): Promise<TMDbResponse<Movie>> {
  const response = await tmdbClient.get<TMDbResponse<Movie>>('/movie/popular', {
    params: { page },
  });
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
    '/movie/upcoming',
    {
      params: { page },
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
    '/movie/now_playing',
    {
      params: { page },
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
    '/movie/top_rated',
    {
      params: { page },
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
  const response = await tmdbClient.get<MovieDetail>(`/movie/${movieId}`);
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

  const response = await tmdbClient.get<TMDbResponse<Movie>>('/search/movie', {
    params: {
      query,
      page,
      year,
      with_genres: genre,
    },
  });
  return response.data;
}

/**
 * ジャンル一覧を取得
 *
 * @returns ジャンル一覧
 */
export async function getGenres() {
  const response = await tmdbClient.get('/genre/movie/list');
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
    '/discover/movie',
    {
      params: {
        with_genres: genreId,
        page,
        sort_by: 'popularity.desc',
      },
    },
  );
  return response.data;
}
