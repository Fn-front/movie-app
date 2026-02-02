/**
 * useMediaQuery - レスポンシブ判定フック
 */

'use client';

import { useSyncExternalStore } from 'react';

/**
 * メディアクエリの一致状態を管理する
 *
 * @param query - メディアクエリ文字列
 * @returns メディアクエリが一致するかどうか
 *
 * @example
 * ```tsx
 * const ResponsiveLayout = () => {
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 *   const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
 *   const isDesktop = useMediaQuery('(min-width: 1025px)');
 *
 *   return (
 *     <div>
 *       {isMobile && <MobileMenu />}
 *       {(isTablet || isDesktop) && <DesktopMenu />}
 *     </div>
 *   );
 * };
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const mediaQueryList = window.matchMedia(query);
    mediaQueryList.addEventListener('change', callback);

    return () => {
      mediaQueryList.removeEventListener('change', callback);
    };
  };

  const getSnapshot = () => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => {
    return false;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
