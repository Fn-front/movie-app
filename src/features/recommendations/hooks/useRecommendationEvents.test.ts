/**
 * レコメンド利用イベント記録フック テスト
 */

import { act, renderHook } from '@testing-library/react';

import { RECOMMENDATION_EVENT_TYPE } from '@/constants';
import type { Recommendation } from '@/schema/recommendations';

const mockRecordRecommendationEvents = jest.fn();
jest.mock('@/lib/api/recommendations/recommendationEvents', () => ({
  recordRecommendationEvents: (...args: unknown[]) =>
    mockRecordRecommendationEvents(...args),
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
const recommendations = [createRecommendation(RECOMMENDATION_ID, 100)];

// --- Tests ---

describe('useRecommendationEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockIntersectionObserver.instances = [];
    mockRecordRecommendationEvents.mockResolvedValue(undefined);
    global.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
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
      act(() => {
        result.current.observeTile(100)(document.createElement('div'));
      });
      act(() => {
        MockIntersectionObserver.instances[1].triggerIntersect();
      });

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

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(1);
    });

    it('種別が異なれば別イベントとして送る', () => {
      const { result } = renderHook(() =>
        useRecommendationEvents(recommendations, true),
      );

      act(() => {
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.CLICK);
        result.current.trackEvent(100, RECOMMENDATION_EVENT_TYPE.DISMISS);
      });

      expect(mockRecordRecommendationEvents).toHaveBeenCalledTimes(2);
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
      }).not.toThrow();
    });
  });
});
