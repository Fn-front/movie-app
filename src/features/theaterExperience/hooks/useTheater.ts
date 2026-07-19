/**
 * 劇場データ取得フック
 */

import { useQuery } from '@tanstack/react-query';

import { theaterKeys, THEATER_STALE_TIME_MS } from '@/constants';
import { getTheaterBySlug } from '@/lib/api/theaters/theaters';

export function useTheater(slug: string) {
  return useQuery({
    queryKey: theaterKeys.detail(slug),
    queryFn: () => getTheaterBySlug(slug),
    staleTime: THEATER_STALE_TIME_MS,
    enabled: !!slug,
  });
}
