/**
 * @jest-environment node
 */

/**
 * レコメンド利用イベント記録API Route テスト
 */

import {
  RECOMMENDATION_EVENT_TYPE,
  RECOMMENDATION_EVENTS_MAX_PER_REQUEST,
} from '@/constants';

import { POST } from './route';

// --- Mocks ---

const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const RECOMMENDATION_ID = '550e8400-e29b-41d4-a716-446655440000';

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/recommendations/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const createEvent = (overrides: Record<string, unknown> = {}) => ({
  recommendation_id: RECOMMENDATION_ID,
  tmdb_movie_id: 12345,
  event_type: RECOMMENDATION_EVENT_TYPE.IMPRESSION,
  ...overrides,
});

// --- Tests ---

describe('POST /api/recommendations/events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockUpsert.mockResolvedValue({ error: null });
  });

  describe('正常系', () => {
    it('イベントを記録して201を返す', async () => {
      const response = await POST(createRequest({ events: [createEvent()] }));
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.recorded).toBe(1);
      expect(mockFrom).toHaveBeenCalledWith('recommendation_events');
      expect(mockUpsert.mock.calls[0][0]).toEqual([
        {
          user_id: 'user-123',
          recommendation_id: RECOMMENDATION_ID,
          tmdb_movie_id: 12345,
          event_type: 'impression',
        },
      ]);
    });

    it('複数件をまとめて記録できる', async () => {
      const events = [
        createEvent(),
        createEvent({ event_type: RECOMMENDATION_EVENT_TYPE.CLICK }),
      ];

      const response = await POST(createRequest({ events }));
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.recorded).toBe(2);
      expect(mockUpsert.mock.calls[0][0]).toHaveLength(2);
    });

    it('4種別すべてを受け付ける', async () => {
      for (const eventType of Object.values(RECOMMENDATION_EVENT_TYPE)) {
        const response = await POST(
          createRequest({ events: [createEvent({ event_type: eventType })] }),
        );
        expect(response.status).toBe(201);
      }
    });

    it('重複は一意制約で無視する（ignoreDuplicates）', async () => {
      // 表示イベントは再訪のたびに送られるため、重複をエラーにしない
      await POST(createRequest({ events: [createEvent()] }));

      expect(mockUpsert.mock.calls[0][1]).toEqual({
        onConflict: 'user_id,recommendation_id,event_type',
        ignoreDuplicates: true,
      });
    });
  });

  describe('認証・レート制限', () => {
    it('未認証の場合401を返す', async () => {
      (getAuthSession as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest({ events: [createEvent()] }));

      expect(response.status).toBe(401);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('レート制限超過の場合429を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await POST(createRequest({ events: [createEvent()] }));

      expect(response.status).toBe(429);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('バリデーション', () => {
    it('イベントが0件の場合400を返す', async () => {
      const response = await POST(createRequest({ events: [] }));

      expect(response.status).toBe(400);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('上限件数を超える場合400を返す', async () => {
      const events = Array.from(
        { length: RECOMMENDATION_EVENTS_MAX_PER_REQUEST + 1 },
        () => createEvent(),
      );

      const response = await POST(createRequest({ events }));

      expect(response.status).toBe(400);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('未知のイベント種別は400を返す', async () => {
      const response = await POST(
        createRequest({ events: [createEvent({ event_type: 'hover' })] }),
      );

      expect(response.status).toBe(400);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('recommendation_idがUUIDでない場合400を返す', async () => {
      const response = await POST(
        createRequest({ events: [createEvent({ recommendation_id: 'abc' })] }),
      );

      expect(response.status).toBe(400);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('tmdb_movie_idが0以下の場合400を返す', async () => {
      const response = await POST(
        createRequest({ events: [createEvent({ tmdb_movie_id: 0 })] }),
      );

      expect(response.status).toBe(400);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('eventsが未指定の場合400を返す', async () => {
      const response = await POST(createRequest({}));

      expect(response.status).toBe(400);
    });
  });

  describe('エラー応答', () => {
    it('DB書き込みに失敗した場合500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockUpsert.mockResolvedValue({ error: { message: 'db error' } });

      const response = await POST(createRequest({ events: [createEvent()] }));
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
    });
  });
});
