/**
 * Intersection Observer カスタムフック
 * 要素がビューポートに表示されたときにコールバックを実行する
 */

import { useEffect, useRef } from 'react';

import { INTERSECTION_OBSERVER } from '@/constants';

interface UseIntersectionObserverOptions {
  /** コールバックを実行するかどうか */
  enabled?: boolean;
  /** ルートマージン */
  rootMargin?: string;
  /** 交差の閾値 */
  threshold?: number;
}

/**
 * Intersection Observerフック
 *
 * @param onIntersect - 要素が表示されたときに呼ばれるコールバック
 * @param options - オプション
 * @returns 監視対象要素に設定するref
 */
export function useIntersectionObserver(
  onIntersect: () => void,
  options: UseIntersectionObserverOptions = {},
) {
  const {
    enabled = true,
    rootMargin = INTERSECTION_OBSERVER.ROOT_MARGIN,
    threshold = 0,
  } = options;
  const targetRef = useRef<HTMLDivElement>(null);
  const onIntersectRef = useRef(onIntersect);

  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    const target = targetRef.current;
    if (!enabled || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersectRef.current();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [enabled, rootMargin, threshold]);

  return targetRef;
}
