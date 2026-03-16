/**
 * TitleSuggestionコンポーネント
 * 検索結果0件時に原題を提案する
 */

'use client';

import { memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { TITLE_SUGGESTION_MESSAGES } from '@/constants';

import styles from './titleSuggestion.module.scss';

/**
 * TitleSuggestionコンポーネントのプロパティ
 */
interface TitleSuggestionProps {
  /** 提案された原題 */
  suggestion: string | null;
  /** ローディング中 */
  isLoading: boolean;
}

/**
 * TitleSuggestionコンポーネント
 */
export const TitleSuggestion = memo<TitleSuggestionProps>(
  function TitleSuggestion({ suggestion, isLoading }) {
    const router = useRouter();

    const handleClick = useCallback(() => {
      if (suggestion) {
        router.push(`/search?query=${encodeURIComponent(suggestion)}`);
      }
    }, [suggestion, router]);

    if (isLoading || !suggestion) {
      return null;
    }

    return (
      <div className={styles.c_title_suggestion}>
        <button
          type='button'
          className={styles.c_title_suggestion__link}
          onClick={handleClick}
        >
          <span className={styles.c_title_suggestion__title}>
            {suggestion}
          </span>
          {TITLE_SUGGESTION_MESSAGES.SUGGESTION_SUFFIX}
        </button>
      </div>
    );
  },
);

TitleSuggestion.displayName = 'TitleSuggestion';
