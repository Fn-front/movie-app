/**
 * useTitleSuggestionフック
 * 検索キーワードに対する原題提案を取得
 */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { suggestTitleApi } from '@/lib/api/titleSuggestion/titleSuggestion';
import { titleSuggestionKeys, TITLE_SUGGESTION } from '@/constants';

/**
 * useTitleSuggestionフックの返り値
 */
export interface UseTitleSuggestionReturn {
  /** 提案された原題候補の配列 */
  suggestions: string[];
  /** ローディング中 */
  isLoading: boolean;
}

/**
 * 原題提案カスタムフック
 *
 * @param query - 検索キーワード
 * @param enabled - フックを有効にするか
 */
export function useTitleSuggestion(
  query: string,
  enabled: boolean,
): UseTitleSuggestionReturn {
  const suggestionQuery = useQuery({
    queryKey: titleSuggestionKeys.query(query),
    queryFn: ({ signal }) => suggestTitleApi(query, { signal }),
    enabled: enabled && query.length > 0,
    staleTime: TITLE_SUGGESTION.STALE_TIME,
  });

  return useMemo(
    () => ({
      suggestions: suggestionQuery.data?.data.suggestions ?? [],
      isLoading: suggestionQuery.isLoading,
    }),
    [suggestionQuery.data, suggestionQuery.isLoading],
  );
}
