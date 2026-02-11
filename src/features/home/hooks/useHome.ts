/**
 * Homeのカスタムフック
 */

import {
  useMovieList,
  type UseMovieListReturn,
} from '@/features/movies/hooks/useMovieList';

export type { DateRange } from '@/features/movies/types';

/**
 * useHomeフックの返り値（UseMovieListReturnと同一）
 */
export type UseHomeReturn = UseMovieListReturn;

/**
 * Homeのカスタムフック
 *
 * useMovieListをtimeFrame無し・日付範囲なしで呼び出す薄いラッパー
 */
export function useHome(): UseHomeReturn {
  return useMovieList({ defaultDateRange: {} });
}
