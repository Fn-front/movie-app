/**
 * TitleSuggestionコンポーネント
 * 検索結果0件時に原題候補を提案する
 */

'use client';

import { memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { Loading } from '@/components/ui/loading/loading';
import { TITLE_SUGGESTION_MESSAGES } from '@/constants';
import { writeStoredSuggestion } from '@/features/search/utils/storedSuggestion';

import styles from './titleSuggestion.module.scss';

/**
 * TitleSuggestionコンポーネントのプロパティ
 */
interface TitleSuggestionProps {
  /** 提案された原題候補の配列 */
  suggestions: string[];
  /** ローディング中 */
  isLoading: boolean;
}

/**
 * TitleSuggestionコンポーネント
 */
export const TitleSuggestion = memo<TitleSuggestionProps>(
  function TitleSuggestion({ suggestions, isLoading }) {
    const router = useRouter();

    const handleClick = useCallback(
      (title: string) => {
        // 遷移先のqueryと対応付けて保存する。対応付けが無いと、別キーワードで
        // 検索したときも「提案クリック由来」と誤判定され、AI提案が無効化された
        // まま無関係な候補が表示され続ける（#824）
        writeStoredSuggestion({ query: title, suggestions });
        router.push(`/search?query=${encodeURIComponent(title)}`);
      },
      [router, suggestions],
    );

    if (isLoading) {
      return (
        <div className={styles.c_title_suggestion}>
          <Loading size='sm' label='原題を検索中...' />
        </div>
      );
    }

    if (suggestions.length === 0) {
      return null;
    }

    return (
      <div className={styles.c_title_suggestion}>
        <p className={styles.c_title_suggestion__label}>
          {TITLE_SUGGESTION_MESSAGES.SUGGESTION_PREFIX}
        </p>
        <ul className={styles.c_title_suggestion__list}>
          {suggestions.map((title) => (
            <li key={title} className={styles.c_title_suggestion__item}>
              <button
                type='button'
                className={styles.c_title_suggestion__link}
                onClick={() => handleClick(title)}
              >
                {title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  },
);

TitleSuggestion.displayName = 'TitleSuggestion';
