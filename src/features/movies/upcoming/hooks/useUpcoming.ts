/**
 * 公開予定映画のカスタムフック
 *
 * サーバー側で release_date >= today のデフォルトフィルタが適用されるため、
 * クライアント側での日付範囲指定は不要。
 */

import { useMovieList } from '@/features/movies/hooks/useMovieList';

/**
 * 公開予定映画のカスタムフック
 */
export function useUpcoming() {
  return useMovieList({ timeFrame: 'upcoming', defaultDateRange: {} });
}
