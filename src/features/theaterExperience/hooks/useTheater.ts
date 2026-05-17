/**
 * 劇場データ取得フック
 */

import { useQuery } from '@tanstack/react-query';

import { theaterKeys } from '@/constants';
import { getTheaterBySlug } from '@/lib/api/theaters/theaters';

const STALE_TIME_24H = 24 * 60 * 60 * 1000;

export function useTheater(slug: string) {
  return useQuery({
    queryKey: theaterKeys.detail(slug),
    queryFn: () => getTheaterBySlug(slug),
    staleTime: STALE_TIME_24H,
    enabled: !!slug,
  });
}
