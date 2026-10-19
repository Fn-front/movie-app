/**
 * レコメンド利用イベント記録フック テスト
 */

import { act, renderHook } from '@testing-library/react';

import {
  RECOMMENDATION_EVENT_TYPE,
  RECOMMENDATION_EVENTS_FLUSH_DELAY_MS,
  RECOMMENDATION_EVENTS_MAX_PER_REQUEST,
  RECOMMENDATION_EVENTS_SENT_STORAGE_KEY,
} from '@/constants';
import type { Recommendation } from '@/schema/recommendations';

const mockRecordRecommendationEvents = jest.fn();
const mockRecordRecommendationEventsOnUnload = jest.fn();
jest.mock('@/lib/api/recommendations/recommendationEvents', () => ({
  recordRecommendationEvents: (...args: unknown[]) =>
    mockRecordRecommendationEvents(...args),
  recordRecommendationEventsOnUnload: (...args: unknown[]) =>
    mockRecordRecommendationEventsOnUnload(...args),
}));

import { useRecommendationEvents } from './useRecommendationEvents';

// --- Helpers ---

/** IntersectionObserver のモック。observe された要素を即座に可視扱いできる */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly callback: IntersectionObserverCallback;
  readonly disconnect = jest.fn();
  readonly observe = jest.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  /** 対象が可視になったことを通知する */
  triggerIntersect(isIntersecting = true) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

const createRecommendation = (
  id: string,
  tmdbMovieId: number,
): Recommendation => ({
  id,
  tmdb_movie_id: tmdbMovieId,
  title: 'テスト映画',
  poster_path: null,
  release_date: null,
  vote_average: null,
  vote_count: 0,
  genre_ids: null,
  reason: '理由',
  display_order: 1,
});

const RECOMMENDATION_ID = '550e8400-e29b-41d4-a716-446655440000';
const SECOND_ID = '660e8400-e29b-41d4-a716-446655440001';
const recommendations = [
  createRecommendation(RECOMMENDATION_ID, 100),
  createRecommendation(SECOND_ID, 200),
];

/** バッチ送信の待ち時間を経過させる */
function advanceToFlush() {
  act(() => {
    jest.advanceTimersByTime(RECOMMENDATION_EVENTS_FLUSH_DELAY_MS);
  });
}

/** sessionStorage に保存されている送信済みキー */
function storedSentKeys(): string[] {
  const raw = window.sessionStorage.getItem(
    RECOMMENDATION_EVENTS_SENT_STORAGE_KEY,
  );
  return raw ? (JSON.parse(raw) as string[]) : [];
}

// --- Tests ---

describe('useRecommendationEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    window.sessionStorage.clear();
    MockIntersectionObserver.instances = [];
    mockRecordRecommendationEvents.mockResolvedValue(undefined);
    global.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('表示（impression）の計測', () => {
    it('要素が可視になったらimpressionを記録する', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[0].triggerIntersect();
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledWith([
        {
          recommendation_id: RECOMMENDATION_ID,
          tmdb_movie_id: 100,
          event_type: RECOMMENDATION_EVENT_TYPE.IMPRESSION,
        },
      ]);
    });

    it('可視になっていない間は記録しない', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[0].triggerIntersect(false);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).not.toHaveBeenCalled();
    });

    it('一度表示されたら監視を解除する', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[0].triggerIntersect();
      });

      expect(
        MockIntersectionObserver.instances[0].disconnect,
      ).toHaveBeenCalled();
    });

    it('同じレコメンドのimpressionを二重に送らない', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[0].triggerIntersect();
      });
      advanceToFlush();
      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[1].triggerIntersect();
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(1);
    });

    it('ref に null が渡されたら監視を解除する', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        result.current.observeTile(100)(null);
      });

      expect(
        MockIntersectionObserver.instances[0].disconnect,
      ).toHaveBeenCalled();
    });

    it('アンマウント時にすべての監視を解除する', () => {
      const { result, unmount } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      unmount();

      expect(
        MockIntersectionObserver.instances[0].disconnect,
      ).toHaveBeenCalled();
    });
  });

  describe('操作イベントの計測', () => {
    it.each([
      RECOMMENDATION_EVENT_TYPE.CLICK,
      RECOMMENDATION_EVENT_TYPE.ADD_TO_WATCHLIST,
      RECOMMENDATION_EVENT_TYPE.DISMISS,
    ])('%s を記録する', (eventType) => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, eventType);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledWith([
        {
          recommendation_id: RECOMMENDATION_ID,
          tmdb_movie_id: 100,
          event_type: eventType,
        },
      ]);
    });

    it('同じ種別を二重に送らない', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: RECOMMENDATION_EVENT_TYPE.CLICK,
        }),
      ]);
    });
  });

  describe('バッチ送信', () => {
    it('待ち時間が経過するまで送信しない', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      act(() => {
        jest.advanceTimersByTime(RECOMMENDATION_EVENTS_FLUSH_DELAY_MS - 1);
      });

      expect(mockRecordRecommendationEvents).not.toHaveBeenCalled();

      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(1);
    });

    it('待ち時間内の複数イベントを1リクエストにまとめる', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.DISMISS);
        result.current.trackEvent(200, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(1);
      expect(mockRecordRecommendationEvents).toHaveBeenCalledWith([
        expect.objectContaining({
          recommendation_id: RECOMMENDATION_ID,
          event_type: RECOMMENDATION_EVENT_TYPE.CLICK,
        }),
        expect.objectContaining({
          recommendation_id: RECOMMENDATION_ID,
          event_type: RECOMMENDATION_EVENT_TYPE.DISMISS,
        }),
        expect.objectContaining({
          recommendation_id: SECOND_ID,
          event_type: RECOMMENDATION_EVENT_TYPE.CLICK,
        }),
      ]);
    });

    it('1リクエストの上限件数で分割して送る', () => {
      const overLimit = RECOMMENDATION_EVENTS_MAX_PER_REQUEST + 1;
      const many = Array.from({ length: overLimit }, (_, i) =>
        createRecommendation(`rec-${i}`, 1000 + i),
      );

      const { result } = renderHook(() => useRecommendationEvents(many, true));

      act(() => {
        for (let i = 0; i < overLimit; i += 1) {
          result.current.trackEvent(1000 + i, RECOMMENDATION_EVENT_TYPE.CLICK);
        }
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(2);
      expect(mockRecordRecommendationEvents.mock.calls[0][0]).toHaveLength(
        RECOMMENDATION_EVENTS_MAX_PER_REQUEST,
      );
      expect(mockRecordRecommendationEvents.mock.calls[1][0]).toHaveLength(1);
    });

    it('送信後は次のイベントを新しいバッチとして送る', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();
      act(() => {
        result.current.trackEvent(200, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(2);
    });
  });

  describe('ページ離脱・アンマウント時のフラッシュ', () => {
    it('pagehide で未送信のキューを keepalive 経路で送る', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      expect(mockRecordRecommendationEventsOnUnload).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: RECOMMENDATION_EVENT_TYPE.CLICK,
        }),
      ]);
      expect(mockRecordRecommendationEvents).not.toHaveBeenCalled();
    });

    it('アンマウント時に未送信のキューを keepalive 経路で送る', () => {
      const { result, unmount } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      unmount();

      expect(mockRecordRecommendationEventsOnUnload).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: RECOMMENDATION_EVENT_TYPE.CLICK,
        }),
      ]);
    });

    it('キューが空なら離脱時に送信しない', () => {
      const { unmount } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      unmount();

      expect(mockRecordRecommendationEventsOnUnload).not.toHaveBeenCalled();
    });

    it('フラッシュ済みのイベントを離脱時に二重送信しない', () => {
      const { result, unmount } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();
      unmount();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(1);
      expect(mockRecordRecommendationEventsOnUnload).not.toHaveBeenCalled();
    });
  });

  describe('送信済みの永続化（再訪時の無駄撃ち防止）', () => {
    it('送信済みキーを sessionStorage に保存する', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });

      expect(storedSentKeys()).toEqual([
        `${RECOMMENDATION_ID}:${RECOMMENDATION_EVENT_TYPE.CLICK}`,
      ]);
    });

    it('再マウントしても送信済みのイベントは再送しない', () => {
      const first = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        first.result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[0].triggerIntersect();
      });
      advanceToFlush();
      first.unmount();

      const second = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        second.result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[1].triggerIntersect();
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(1);
    });

    it('レコメンドが洗い替えられてIDが変わればあらためて記録する', () => {
      const { result, rerender } = renderHook(
        ({ items }: { items: Recommendation[] }) =>
          useRecommendationEvents(items, true),
        { initialProps: { items: recommendations } },
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      rerender({ items: [createRecommendation('refreshed-id', 100)] });
      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(2);
      expect(mockRecordRecommendationEvents.mock.calls[1][0]).toEqual([
        expect.objectContaining({ recommendation_id: 'refreshed-id' }),
      ]);
    });

    it('sessionStorage の値が壊れていても計測を続ける', () => {
      window.sessionStorage.setItem(
        RECOMMENDATION_EVENTS_SENT_STORAGE_KEY,
        '{壊れたJSON',
      );

      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(1);
    });
  });

  describe('計測を行わない条件', () => {
    it('enabled が false の場合、操作イベントを送らない', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, false),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).not.toHaveBeenCalled();
    });

    it('enabled が false の場合、Observerを作らない', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, false),
      );

      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });

      expect(MockIntersectionObserver.instances).toHaveLength(0);
    });

    it('一覧に無い映画IDは送らない', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(999, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).not.toHaveBeenCalled();
    });
  });

  describe('エラー応答', () => {
    it('送信に失敗しても例外を投げない', () => {
      mockRecordRecommendationEvents.mockRejectedValue(new Error('network'));

      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      expect(() => {
        act(() => {
          result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
        });
        advanceToFlush();
      }).not.toThrow();
    });

    it('送信に失敗したイベントは送信済みから外して再送できるようにする', async () => {
      mockRecordRecommendationEvents.mockRejectedValue(new Error('network'));

      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();
      // 失敗の握りつぶしは Promise のマイクロタスクで処理される
      await act(async () => {});

      expect(storedSentKeys()).toEqual([]);

      mockRecordRecommendationEvents.mockResolvedValue(undefined);
      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
      });
      advanceToFlush();

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(2);
    });
  });
});
