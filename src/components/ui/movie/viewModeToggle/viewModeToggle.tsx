/**
 * ViewModeToggleコンポーネント
 * 映画一覧のグリッド／リスト表示を切り替えるトグル（#1014）
 */

'use client';

import { memo, useCallback } from 'react';
import { IoGridOutline, IoListOutline } from 'react-icons/io5';

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
        // 「今どちらか」はアイコンだけでは伝わらないため、押下状態でも伝える
        aria-pressed={isList}
        aria-label={
          isList
            ? ARIA_LABELS.SWITCH_TO_GRID_VIEW
            : ARIA_LABELS.SWITCH_TO_LIST_VIEW
        }
      >
        {isList ? (
          <IoGridOutline size={ICON_SIZES.SM} aria-hidden='true' />
        ) : (
          <IoListOutline size={ICON_SIZES.SM} aria-hidden='true' />
        )}
      </button>
    );
  },
);

ViewModeToggle.displayName = 'ViewModeToggle';
