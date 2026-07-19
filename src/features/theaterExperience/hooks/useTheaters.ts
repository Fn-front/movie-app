/**
 * 劇場一覧取得フック
 */

import { useQuery } from '@tanstack/react-query';

import { theaterKeys } from '@/constants';
import { getTheaters } from '@/lib/api/theaters/theaters';

const STALE_TIME_24H = 24 * 60 * 60 * 1000;

export function useTheaters() {
  return useQuery({
    queryKey: theaterKeys.list,
    queryFn: getTheaters,
    staleTime: STALE_TIME_24H,
  });
}
