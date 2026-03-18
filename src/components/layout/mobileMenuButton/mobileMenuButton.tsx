/**
 * MobileMenuButtonコンポーネント
 * ハンバーガーメニューボタン（lg未満で表示）
 */

'use client';

import { memo, useCallback } from 'react';
import { IoMenuOutline, IoCloseOutline } from 'react-icons/io5';

import { ARIA_LABELS } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './mobileMenuButton.module.scss';

/**
 * MobileMenuButtonコンポーネントのプロパティ
 */
export interface MobileMenuButtonProps {
  /** メニューの開閉状態 */
  isOpen: boolean;
  /** メニュー開閉のコールバック */
  onToggle: () => void;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * MobileMenuButtonコンポーネント
 *
 * @example
 * ```tsx
 * <MobileMenuButton isOpen={isDrawerOpen} onToggle={handleToggleDrawer} />
 * ```
 */
export const MobileMenuButton = memo<MobileMenuButtonProps>(
  function MobileMenuButton({ isOpen, onToggle, className }) {
    const classNames = cn(styles.c_mobile_menu_button, className);

    const handleClick = useCallback(() => {
      onToggle();
    }, [onToggle]);

    return (
      <button
        type='button'
        className={classNames}
        onClick={handleClick}
        aria-label={isOpen ? ARIA_LABELS.CLOSE_MENU : ARIA_LABELS.OPEN_MENU}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <IoCloseOutline size={24} aria-hidden='true' />
        ) : (
          <IoMenuOutline size={24} aria-hidden='true' />
        )}
      </button>
    );
  },
);

MobileMenuButton.displayName = 'MobileMenuButton';
