/**
 * レコメンド利用イベント記録カスタムフック
 * 表示・クリック・ウォッチリスト追加・興味なし を記録する
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  RECOMMENDATION_EVENT_TYPE,
  RECOMMENDATION_IMPRESSION_THRESHOLD,
  type RecommendationEventType,
} from '@/constants';
import { recordRecommendationEvents } from '@/lib/api/recommendations/recommendationEvents';
import type { Recommendation } from '@/schema/recommendations';

/**
 * useRecommendationEventsフックの返り値
 */
export interface UseRecommendationEventsReturn {
  /**
   * 表示計測の対象要素を登録する ref コールバック
   * @param tmdbMovieId - 対象のTMDb映画ID
   */
  observeTile: (tmdbMovieId: number) => (element: HTMLElement | null) => void;
  /** クリック・ウォッチリスト追加・興味なし を記録する */
  trackEvent: (
    tmdbMovieId: number,
    eventType: Exclude<RecommendationEventType, 'impression'>,
  ) => void;
}

/**
 * レコメンド利用イベント記録フック
 *
 * 表示イベントは Intersection Observer で計測し、同一レンダリング中の
 * 重複送信を避けるため送信済みのキーを保持する。サーバー側も
 * （user_id, recommendation_id, event_type）の一意制約で重複を弾くため、
 * 再訪時に二重計上されることはない。
 *
 * 計測の失敗がユーザー操作を妨げてはいけないので、送信エラーは握りつぶす。
 *
 * @param recommendations - 表示中のレコメンド一覧
 * @param enabled - 計測を行うか（未認証時は false）
 */
export function useRecommendationEvents(
  recommendations: Recommendation[],
  enabled: boolean,
): UseRecommendationEventsReturn {
  /** tmdb_movie_id → recommendation.id の対応。送信時のID解決に使う */
  const idMap = useMemo(
    () => new Map(recommendations.map((r) => [r.tmdb_movie_id, r.id])),
    [recommendations],
  );
  /** 送信済みイベントのキー（`${recommendationId}:${eventType}`） */
  const sentRef = useRef(new Set<string>());
  /** 要素ごとのObserver。アンマウント時にまとめて解除する */
  const observersRef = useRef(new Map<number, IntersectionObserver>());

  const send = useCallback(
    (tmdbMovieId: number, eventType: RecommendationEventType) => {
      const recommendationId = idMap.get(tmdbMovieId);
      if (!enabled || !recommendationId) {
        return;
      }

      const key = `${recommendationId}:${eventType}`;
      if (sentRef.current.has(key)) {
        return;
      }
      sentRef.current.add(key);

      void recordRecommendationEvents([
        {
          recommendation_id: recommendationId,
          tmdb_movie_id: tmdbMovieId,
          event_type: eventType,
        },
      ]).catch(() => {
        // 計測の失敗はユーザー操作に影響させない。
        // 送信済みキーは残し、失敗したイベントで再送を繰り返さないようにする。
      });
    },
    [enabled, idMap],
  );

  const observeTile = useCallback(
    (tmdbMovieId: number) => (element: HTMLElement | null) => {
      observersRef.current.get(tmdbMovieId)?.disconnect();
      observersRef.current.delete(tmdbMovieId);

      if (!element || !enabled) {
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }
          send(tmdbMovieId, RECOMMENDATION_EVENT_TYPE.IMPRESSION);
          // 一度表示されれば以降の監視は不要
          observer.disconnect();
          observersRef.current.delete(tmdbMovieId);
        },
        { threshold: RECOMMENDATION_IMPRESSION_THRESHOLD },
      );
      observer.observe(element);
      observersRef.current.set(tmdbMovieId, observer);
    },
    [enabled, send],
  );

  const trackEvent = useCallback(
    (
      tmdbMovieId: number,
      eventType: Exclude<RecommendationEventType, 'impression'>,
    ) => {
      send(tmdbMovieId, eventType);
    },
    [send],
  );

  useEffect(() => {
    const observers = observersRef.current;
    return () => {
      for (const observer of observers.values()) {
        observer.disconnect();
      }
      observers.clear();
    };
  }, []);

  return { observeTile, trackEvent };
}
