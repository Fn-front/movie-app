/**
 * レコメンド利用イベント記録カスタムフック
 * 表示・クリック・ウォッチリスト追加・興味なし を記録する
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  RECOMMENDATION_EVENT_TYPE,
  RECOMMENDATION_EVENTS_FLUSH_DELAY_MS,
  RECOMMENDATION_EVENTS_MAX_PER_REQUEST,
  RECOMMENDATION_EVENTS_SENT_STORAGE_KEY,
  RECOMMENDATION_IMPRESSION_THRESHOLD,
  type RecommendationEventType,
} from '@/constants';
import {
  recordRecommendationEvents,
  recordRecommendationEventsOnUnload,
} from '@/lib/api/recommendations/recommendationEvents';
import type {
  Recommendation,
  RecommendationEvent,
} from '@/schema/recommendations';

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

/** 送信済みイベントのキーを sessionStorage から復元する */
function loadSentKeys(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const raw = window.sessionStorage.getItem(
      RECOMMENDATION_EVENTS_SENT_STORAGE_KEY,
    );
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === 'string')
        : [],
    );
  } catch {
    // プライベートモードや壊れた値。重複送信はサーバー側の一意制約が吸収する
    return new Set();
  }
}

/** 送信済みイベントのキーを sessionStorage に保存する */
function saveSentKeys(keys: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      RECOMMENDATION_EVENTS_SENT_STORAGE_KEY,
      JSON.stringify([...keys]),
    );
  } catch {
    // 容量超過など。メモリ上の Set は残るのでこのページでの重複送信は防げる
  }
}

/** イベントから送信済み判定用のキーを作る */
function toSentKey(recommendationId: string, eventType: string): string {
  return `${recommendationId}:${eventType}`;
}

/**
 * レコメンド利用イベント記録フック
 *
 * 表示イベントは Intersection Observer で計測する。1件ずつ送るとレート制限に
 * 即到達するため、短い待ち時間でキューにためて1リクエストにまとめる（#757）。
 * ページ離脱・アンマウント時は keepalive 付きの送信でキューを吐き出す。
 *
 * 送信済みのキーは sessionStorage に永続化する。サーバー側も
 * （user_id, recommendation_id, event_type）の一意制約で重複を弾くため、
 * 再訪時の再送はDB上 no-op だが、レート制限の枠だけを消費してしまう。
 *
 * 計測の失敗がユーザー操作を妨げてはいけないので、送信エラーは握りつぶす。
 * ただし送信済みのキーは取り消し、次の機会に再送できるようにする
 * （失敗を送信済みのまま残すと、クリックやウォッチリスト追加が優先的に
 * 失われてCTR等が実際より低く出る）。
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
  const sentRef = useRef<Set<string> | null>(null);
  if (sentRef.current === null) {
    // ref の中身を作り直さないためのパターン。sessionStorage の読み出しを
    // 初回レンダリングの1回だけに抑える。
    sentRef.current = loadSentKeys();
  }
  /** 送信済みイベントのキー（`${recommendationId}:${eventType}`） */
  const sentKeys = sentRef.current;
  /** 送信待ちのイベント */
  const queueRef = useRef<RecommendationEvent[]>([]);
  /** バッチ送信のタイマー。null ならタイマー未設定 */
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 要素ごとのObserver。アンマウント時にまとめて解除する */
  const observersRef = useRef(new Map<number, IntersectionObserver>());

  /** 送信に失敗したイベントを未送信に戻す */
  const forgetSentKeys = useCallback(
    (events: RecommendationEvent[]) => {
      for (const event of events) {
        sentKeys.delete(toSentKey(event.recommendation_id, event.event_type));
      }
      saveSentKeys(sentKeys);
    },
    [sentKeys],
  );

  /**
   * キューを1リクエストの上限件数ごとに分割して送信する
   *
   * @param onUnload - ページ離脱・アンマウント時は keepalive 経路で送る
   */
  const flush = useCallback(
    (onUnload: boolean) => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      const queued = queueRef.current;
      if (queued.length === 0) {
        return;
      }
      queueRef.current = [];

      for (
        let i = 0;
        i < queued.length;
        i += RECOMMENDATION_EVENTS_MAX_PER_REQUEST
      ) {
        const chunk = queued.slice(
          i,
          i + RECOMMENDATION_EVENTS_MAX_PER_REQUEST,
        );

        if (onUnload) {
          // 離脱後は結果を受け取れないため、失敗しても再送はできない
          recordRecommendationEventsOnUnload(chunk);
          continue;
        }

        void recordRecommendationEvents(chunk).catch(() => {
          forgetSentKeys(chunk);
        });
      }
    },
    [forgetSentKeys],
  );

  const send = useCallback(
    (tmdbMovieId: number, eventType: RecommendationEventType) => {
      const recommendationId = idMap.get(tmdbMovieId);
      if (!enabled || !recommendationId) {
        return;
      }

      const key = toSentKey(recommendationId, eventType);
      if (sentKeys.has(key)) {
        return;
      }
      sentKeys.add(key);
      saveSentKeys(sentKeys);

      queueRef.current.push({
        recommendation_id: recommendationId,
        tmdb_movie_id: tmdbMovieId,
        event_type: eventType,
      });

      // 表示イベントは画面表示時に一斉に発火する。最初の1件から一定時間
      // 待つことで、1ページ表示あたりのリクエストを1本にまとめる。
      // デバウンスではなく固定長のバッチ窓にして、送信の遅延に上限を設ける。
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(() => {
          flush(false);
        }, RECOMMENDATION_EVENTS_FLUSH_DELAY_MS);
      }
    },
    [enabled, flush, idMap, sentKeys],
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

  useEffect(() => {
    const handlePageHide = () => {
      flush(true);
    };

    // bfcache に入る場合も含めて確実に発火するのは pagehide（unload ではない）
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      // アンマウントがページ離脱と同時に起きることもあるため keepalive で送る
      flush(true);
    };
  }, [flush]);

  return { observeTile, trackEvent };
}
