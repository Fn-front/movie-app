/**
 * useMediaQuery - レスポンシブ判定フック
 */

'use client';

import { useEffect, useState } from 'react';

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
  // サーバーサイドレンダリング対応
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQueryList = window.matchMedia(query);

    // 初期値を設定
    setMatches(mediaQueryList.matches);

    // メディアクエリの変化を監視
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // リスナーを追加
    mediaQueryList.addEventListener('change', handleChange);

    // クリーンアップ
    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}
