/**
 * MobileDrawerの状態管理フック
 */

'use client';

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * MobileDrawerの開閉状態を管理するカスタムフック
 * ページ遷移時に自動で閉じる
 */
export const useMobileDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  // pathnameが変わったら閉じる（React推奨: レンダー中のprops変更検出パターン）
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (isOpen) {
      setIsOpen(false);
    }
  }

  /** Drawerを開閉する */
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  /** Drawerの開閉状態を変更する（Radix UI用） */
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return {
    isOpen,
    handleToggle,
    handleOpenChange,
  };
};
