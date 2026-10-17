/**
 * @jest-environment node
 */

/**
 * レコメンド手動更新API Route テスト (POST /api/recommendations/refresh)
 */

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
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

const mockProcessUserRecommendations = jest.fn();
jest.mock('@/lib/recommendations/generateRecommendationsService', () => ({
  processUserRecommendations: (...args: unknown[]) =>
    mockProcessUserRecommendations(...args),
}));

/** 予約INSERT / 予約DELETE の呼び出しを記録するスパイ */
const mockReservationInsert = jest.fn();
const mockReservationDelete = jest.fn();

const mockCheckCooldown = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkCooldown: (...args: unknown[]) => mockCheckCooldown(...args),
}));

import { getAuthSession } from '@/helpers/auth';
import { RATE_LIMIT_ACTION, RECOMMENDATION_REFRESH } from '@/constants';

// --- Helpers ---

const createPostRequest = () =>
  new Request('http://localhost/api/recommendations/refresh', {
    method: 'POST',
  });

/**
 * 当月回数カウント用のSupabaseチェーンモック
 */
function mockCountChain(count: number) {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        gte: () => Promise.resolve({ count, error: null }),
      }),
    }),
  });
}

/**
 * 回数枠の予約INSERT用モック（insert → select → single）
 */
function mockReservationSuccess(id = 'refresh-1') {
  mockFrom.mockReturnValueOnce({
    insert: (...args: unknown[]) => {
      mockReservationInsert(...args);
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id }, error: null }),
        }),
      };
    },
  });
}

/**
 * 予約INSERT失敗用モック
 */
function mockReservationFailure() {
  mockFrom.mockReturnValueOnce({
    insert: () => ({
      select: () => ({
        single: () =>
          Promise.resolve({ data: null, error: new Error('insert failed') }),
      }),
    }),
  });
}

/**
 * 予約の取り消し（DELETE）用モック
 */
function mockReleaseReservation(error: Error | null = null) {
  mockFrom.mockReturnValueOnce({
    delete: () => ({
      eq: (...args: unknown[]) => {
        mockReservationDelete(...args);
        return Promise.resolve({ error });
      },
    }),
  });
}

/**
 * レコメンド取得用モック
 */
function mockFetchRecommendations(data: Record<string, unknown>[]) {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data, error: null }),
      }),
    }),
  });
}

// --- Tests ---

describe('POST /api/recommendations/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
    mockCheckCooldown.mockResolvedValue({ allowed: true });
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(createPostRequest());

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('クールダウン中は429を返し、Retry-Afterヘッダーを付ける', async () => {
    mockCheckCooldown.mockResolvedValue({ allowed: false, retryAfter: 42 });

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('REFRESH_COOLDOWN');
    expect(response.headers.get('Retry-After')).toBe('42');
  });

  it('クールダウン中はレコメンド生成処理を実行しない', async () => {
    mockCheckCooldown.mockResolvedValue({ allowed: false, retryAfter: 60 });

    await POST(createPostRequest());

    expect(mockProcessUserRecommendations).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('クールダウン拒否でretryAfterが無い場合はRetry-Afterを付けない', async () => {
    mockCheckCooldown.mockResolvedValue({ allowed: false });

    const response = await POST(createPostRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeNull();
  });

  it('クールダウンはユーザーIDと設定秒数で判定される', async () => {
    mockCountChain(0);
    mockReservationSuccess();
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 1,
    });
    mockFetchRecommendations([]);

    await POST(createPostRequest());

    expect(mockCheckCooldown).toHaveBeenCalledWith(
      expect.anything(),
      'user-123',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      RECOMMENDATION_REFRESH.SERVER_COOLDOWN_SECONDS,
    );
  });

  it('上限到達時に429を返す', async () => {
    mockCountChain(10);

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('REFRESH_LIMIT_EXCEEDED');
  });

  it('正常にレコメンドを更新できる', async () => {
    const mockRecommendations = [
      {
        id: 'rec-1',
        tmdb_movie_id: 100,
        title: 'テスト映画',
        poster_path: '/poster.jpg',
        release_date: '2025-01-01',
        vote_average: 8.5,
        genre_ids: [28],
        reason: 'テスト理由',
        display_order: 1,
      },
    ];

    // 1. カウントチェック（0回使用済み）
    mockCountChain(0);
    // 2. 回数枠の予約INSERT（生成より前）
    mockReservationSuccess();
    // 3. processUserRecommendations成功
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 1,
    });
    // 4. レコメンド取得
    mockFetchRecommendations(mockRecommendations);

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.remainingCount).toBe(9);
    expect(json.data.recommendations).toHaveLength(1);
    expect(json.data.recommendations[0].title).toBe('テスト映画');
  });

  it('レコメンド生成がskippedの場合に500を返し、予約した回数枠を取り消す', async () => {
    mockCountChain(0);
    mockReservationSuccess('refresh-skip');
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'skipped',
      recommendationCount: 0,
    });
    mockReleaseReservation();

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('GENERATION_FAILED');
    // 予約した行が削除される（＝回数は消費されない）
    expect(mockReservationDelete).toHaveBeenCalledWith('id', 'refresh-skip');
  });

  it('カウント取得時のDBエラーで500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          gte: () =>
            Promise.resolve({ count: null, error: new Error('DB error') }),
        }),
      }),
    });

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it('予約INSERTのDBエラーで500を返し、生成処理を実行しない', async () => {
    mockCountChain(0);
    mockReservationFailure();

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(mockProcessUserRecommendations).not.toHaveBeenCalled();
  });

  it('レスポンスにvote_countが含まれ、SELECT句にも指定されている', async () => {
    const selectSpy = jest.fn();

    mockCountChain(0);
    mockReservationSuccess();
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 1,
    });
    mockFrom.mockReturnValueOnce({
      select: (columns: string) => {
        selectSpy(columns);
        return {
          eq: () => ({
            order: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'rec-1',
                    tmdb_movie_id: 100,
                    title: 'テスト映画',
                    poster_path: '/poster.jpg',
                    release_date: '2025-01-01',
                    vote_average: 8.5,
                    vote_count: 1234,
                    genre_ids: [28],
                    reason: 'テスト理由',
                    display_order: 1,
                  },
                ],
                error: null,
              }),
          }),
        };
      },
    });

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.recommendations[0].vote_count).toBe(1234);
    expect(selectSpy).toHaveBeenCalledWith(
      expect.stringContaining('vote_count'),
    );
  });

  it('回数枠の予約は生成処理より前にINSERTされる', async () => {
    const callOrder: string[] = [];

    mockCountChain(0);
    mockFrom.mockReturnValueOnce({
      insert: () => {
        callOrder.push('reserve');
        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: 'refresh-1' }, error: null }),
          }),
        };
      },
    });
    mockProcessUserRecommendations.mockImplementationOnce(async () => {
      callOrder.push('generate');
      return { status: 'processed', recommendationCount: 1 };
    });
    mockFetchRecommendations([]);

    await POST(createPostRequest());

    expect(callOrder).toEqual(['reserve', 'generate']);
  });

  it('予約には認証ユーザーのIDが使われる', async () => {
    mockCountChain(0);
    mockReservationSuccess();
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 1,
    });
    mockFetchRecommendations([]);

    await POST(createPostRequest());

    expect(mockReservationInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
    });
  });

  it('生成成功時は予約を取り消さない', async () => {
    mockCountChain(0);
    mockReservationSuccess();
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 1,
    });
    mockFetchRecommendations([]);

    await POST(createPostRequest());

    expect(mockReservationDelete).not.toHaveBeenCalled();
  });

  it('生成処理が例外を投げた場合も予約した回数枠を取り消す', async () => {
    mockCountChain(0);
    mockReservationSuccess('refresh-throw');
    mockProcessUserRecommendations.mockRejectedValueOnce(
      new Error('OpenAI down'),
    );
    mockReleaseReservation();

    const response = await POST(createPostRequest());

    expect(response.status).toBe(500);
    expect(mockReservationDelete).toHaveBeenCalledWith('id', 'refresh-throw');
  });

  it('予約の取り消しに失敗してもレスポンスは返る', async () => {
    mockCountChain(0);
    mockReservationSuccess();
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'skipped',
      recommendationCount: 0,
    });
    mockReleaseReservation(new Error('delete failed'));

    const response = await POST(createPostRequest());

    expect(response.status).toBe(500);
  });

  it('リクエストのsignalを生成処理に伝播する', async () => {
    mockCountChain(0);
    mockReservationSuccess();
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 1,
    });
    mockFetchRecommendations([]);

    const request = createPostRequest();
    await POST(request);

    expect(mockProcessUserRecommendations).toHaveBeenCalledWith(
      expect.anything(),
      'user-123',
      request.signal,
    );
  });

  it('残り回数が正しく計算される（5回使用済み→残り4回）', async () => {
    mockCountChain(5);
    mockReservationSuccess();
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 10,
    });
    mockFetchRecommendations([]);

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.remainingCount).toBe(4);
  });
});
