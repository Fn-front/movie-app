/**
 * 人物詳細取得フック
 */

import { useQuery } from '@tanstack/react-query';

import { personKeys, PERSON_STALE_TIME_MS } from '@/constants';
import { getPerson } from '@/lib/api/person/person';
import type { PersonDetail } from '@/lib/types';

export interface UsePersonReturn {
  person: PersonDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * 人物詳細を取得する
 *
 * 人物プロフィールは頻繁に変わらないため staleTime を長く取り、
 * API の Cache-Control（s-maxage=24h）と揃える。
 *
 * @param personId - 人物ID
 */
export function usePerson(personId: number): UsePersonReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: personKeys.detail(personId),
    queryFn: () => getPerson(personId),
    staleTime: PERSON_STALE_TIME_MS,
  });

  return { person: data, isLoading, isError, refetch };
}
