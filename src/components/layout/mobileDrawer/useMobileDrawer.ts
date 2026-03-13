/**
 * MobileDrawerの状態管理フック
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * MobileDrawerの開閉状態を管理するカスタムフック
 * ページ遷移時に自動で閉じる
 */
export const useMobileDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  /** Drawerを開閉する */
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  /** Drawerの開閉状態を変更する（Radix UI用） */
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  // ページ遷移時に自動で閉じる
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return {
    isOpen,
    handleToggle,
    handleOpenChange,
  };
};
