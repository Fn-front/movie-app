/**
 * ViewModeToggleコンポーネント
 * 映画一覧のグリッド／リスト表示を切り替えるトグル（#1014）
 */

'use client';

import { memo, useCallback } from 'react';
import { IoListOutline } from 'react-icons/io5';

import { ARIA_LABELS, ICON_SIZES } from '@/constants';
import { useMovieViewMode } from '@/hooks/useMovieViewMode';
import { cn } from '@/utils/cn';

import styles from './viewModeToggle.module.scss';

/**
 * ViewModeToggleコンポーネントのプロパティ
 */
export interface ViewModeToggleProps {
  /** カスタムクラス名 */
  className?: string;
}

/**
 * 映画一覧の表示モードを切り替えるトグル
 *
 * 設定は全画面で共通（`useMovieViewMode`）。同じ画面に複数置いても同期する。
 *
 * 押下状態（`aria-pressed`）がリスト表示かどうかを表す。
 *
 * @example
 * ```tsx
 * <ViewModeToggle className={styles.c_movie_list__view_toggle} />
 * ```
 */
export const ViewModeToggle = memo<ViewModeToggleProps>(
  function ViewModeToggle({ className }) {
    const { viewMode, setViewMode } = useMovieViewMode();
    const isList = viewMode === 'list';

    const handleClick = useCallback(() => {
      setViewMode(isList ? 'grid' : 'list');
    }, [isList, setViewMode]);

    return (
      <button
        type='button'
        className={cn(styles.c_view_mode_toggle, className)}
        onClick={handleClick}
        // 状態は aria-pressed だけで伝える。ラベルとアイコンを状態で
        // 入れ替えると「オン」が何を指すのか反転して読まれる
        aria-pressed={isList}
        aria-label={ARIA_LABELS.LIST_VIEW}
      >
        <IoListOutline size={ICON_SIZES.SM} aria-hidden='true' />
      </button>
    );
  },
);

ViewModeToggle.displayName = 'ViewModeToggle';
