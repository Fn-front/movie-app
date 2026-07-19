/**
 * 劇場一覧取得フック
 */

import { useQuery } from '@tanstack/react-query';

import { theaterKeys, THEATER_STALE_TIME_MS } from '@/constants';
import { getTheaters } from '@/lib/api/theaters/theaters';

export function useTheaters() {
  return useQuery({
    queryKey: theaterKeys.list,
    queryFn: getTheaters,
    staleTime: THEATER_STALE_TIME_MS,
  });
}
