/**
 * レコメンド利用イベント記録API クライアント テスト
 */

import { API_ENDPOINTS, RECOMMENDATION_EVENT_TYPE } from '@/constants';
import type { RecommendationEvent } from '@/schema/recommendations';

const mockPost = jest.fn();
jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: { post: (...args: unknown[]) => mockPost(...args) },
}));

import {
  recordRecommendationEvents,
  recordRecommendationEventsOnUnload,
} from './recommendationEvents';

// --- Helpers ---

const events: RecommendationEvent[] = [
  {
    recommendation_id: '550e8400-e29b-41d4-a716-446655440000',
    tmdb_movie_id: 100,
    event_type: RECOMMENDATION_EVENT_TYPE.IMPRESSION,
  },
];

// --- Tests ---

describe('recordRecommendationEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: { success: true } });
  });

  it('イベントをまとめてPOSTする', async () => {
    await recordRecommendationEvents(events);

    expect(mockPost).toHaveBeenCalledWith(
      API_ENDPOINTS.RECOMMENDATIONS_EVENTS,
      {
        events,
      },
    );
  });

  it('送信に失敗したら呼び出し側に伝播する（握りつぶさない）', async () => {
    mockPost.mockRejectedValue(new Error('network'));

    await expect(recordRecommendationEvents(events)).rejects.toThrow('network');
  });
});

describe('recordRecommendationEventsOnUnload', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('keepalive を付けた fetch で送る（離脱時に破棄されないため）', () => {
    recordRecommendationEventsOnUnload(events);

    expect(mockFetch).toHaveBeenCalledWith(
      API_ENDPOINTS.RECOMMENDATIONS_EVENTS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        credentials: 'same-origin',
        keepalive: true,
      },
    );
  });

  it('イベントが無ければ送信しない', () => {
    recordRecommendationEventsOnUnload([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('送信に失敗しても例外を投げない', async () => {
    mockFetch.mockRejectedValue(new Error('network'));

    expect(() => recordRecommendationEventsOnUnload(events)).not.toThrow();
    // 握りつぶしは catch で処理されるため、未処理の rejection にならない
    await Promise.resolve();
  });
});
