/**
 * 公開中映画のカスタムフック
 *
 * 劇場公開の場合はサーバー側で is_now_playing フラグによりフィルタされるため、
 * クライアント側での日付範囲計算は不要。
 */

import { useMovieList } from '@/features/movies/hooks/useMovieList';

/**
 * 公開中映画のカスタムフック
 */
export function useNowShowing() {
  return useMovieList({
    timeFrame: 'now_showing',
    defaultSortOrder: 'desc',
    defaultDateRange: {},
  });
}
