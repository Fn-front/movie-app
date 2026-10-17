/**
 * @jest-environment node
 */

/**
 * 初回お気に入り追加時の即時レコメンド生成 テスト
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// --- Mocks ---

const mockProcessUserRecommendations = jest.fn();
jest.mock('./generateRecommendationsService', () => ({
  processUserRecommendations: (...args: unknown[]) =>
    mockProcessUserRecommendations(...args),
}));

import {
  runInstantRecommendationIfEligible,
  shouldGenerateInstantly,
} from './instantRecommendation';

// --- Helpers ---

const mockFrom = jest.fn();
const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

/** recommendations の件数取得をモックする */
const mockRecommendationCount = (
  count: number | null,
  error: Error | null = null,
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => Promise.resolve({ count, error }),
    }),
  });
};

/** 権利確保の条件付きUPDATEをモックする */
const mockClaim = (
  updatedRows: { id: string }[] | null,
  error: Error | null = null,
) => {
  mockFrom.mockReturnValueOnce({
    update: () => ({
      eq: () => ({
        is: () => ({
          select: () => Promise.resolve({ data: updatedRows, error }),
        }),
      }),
    }),
  });
};

// --- Tests ---

describe('instantRecommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockProcessUserRecommendations.mockResolvedValue({
      status: 'processed',
      recommendationCount: 10,
      metrics: {
        openai_calls: 1,
        ai_candidates: 15,
        unresolved_candidates: 5,
        retries_used: 0,
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldGenerateInstantly', () => {
    it('レコメンド0件かつ未使用なら権利を確保してtrueを返す', async () => {
      mockRecommendationCount(0);
      mockClaim([{ id: 'user-1' }]);

      const result = await shouldGenerateInstantly(mockSupabase, 'user-1');

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenNthCalledWith(1, 'recommendations');
      expect(mockFrom).toHaveBeenNthCalledWith(2, 'users');
    });

    it('レコメンドが既にある場合は権利を消費せずfalseを返す', async () => {
      mockRecommendationCount(10);

      const result = await shouldGenerateInstantly(mockSupabase, 'user-1');

      expect(result).toBe(false);
      // users への UPDATE は走らない
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('権利が使用済みの場合はfalseを返す（生涯1回）', async () => {
      // 条件付きUPDATEが0行 = 既に使用済み
      mockRecommendationCount(0);
      mockClaim([]);

      const result = await shouldGenerateInstantly(mockSupabase, 'user-1');

      expect(result).toBe(false);
    });

    it('件数取得に失敗した場合はfalseを返す', async () => {
      mockRecommendationCount(null, new Error('DB error'));

      const result = await shouldGenerateInstantly(mockSupabase, 'user-1');

      expect(result).toBe(false);
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('権利確保に失敗した場合はfalseを返す', async () => {
      mockRecommendationCount(0);
      mockClaim(null, new Error('DB error'));

      const result = await shouldGenerateInstantly(mockSupabase, 'user-1');

      expect(result).toBe(false);
    });

    it('countがnullでも0件として扱う', async () => {
      mockRecommendationCount(null);
      mockClaim([{ id: 'user-1' }]);

      const result = await shouldGenerateInstantly(mockSupabase, 'user-1');

      expect(result).toBe(true);
    });
  });

  describe('runInstantRecommendationIfEligible', () => {
    it('条件を満たす場合に生成を実行する', async () => {
      mockRecommendationCount(0);
      mockClaim([{ id: 'user-1' }]);

      await runInstantRecommendationIfEligible(mockSupabase, 'user-1');

      expect(mockProcessUserRecommendations).toHaveBeenCalledWith(
        mockSupabase,
        'user-1',
      );
    });

    it('条件を満たさない場合は生成しない', async () => {
      mockRecommendationCount(5);

      await runInstantRecommendationIfEligible(mockSupabase, 'user-1');

      expect(mockProcessUserRecommendations).not.toHaveBeenCalled();
    });

    it('2件目以降のお気に入り追加では生成しない（使用済み）', async () => {
      mockRecommendationCount(0);
      mockClaim([]);

      await runInstantRecommendationIfEligible(mockSupabase, 'user-1');

      expect(mockProcessUserRecommendations).not.toHaveBeenCalled();
    });

    it('生成が失敗しても例外を投げない', async () => {
      // バックグラウンド処理なので、失敗は次回CRONに任せる
      mockRecommendationCount(0);
      mockClaim([{ id: 'user-1' }]);
      mockProcessUserRecommendations.mockRejectedValue(
        new Error('OpenAI error'),
      );

      await expect(
        runInstantRecommendationIfEligible(mockSupabase, 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('DBアクセスが例外を投げても握りつぶす', async () => {
      mockFrom.mockImplementationOnce(() => {
        throw new Error('connection lost');
      });

      await expect(
        runInstantRecommendationIfEligible(mockSupabase, 'user-1'),
      ).resolves.toBeUndefined();
      expect(mockProcessUserRecommendations).not.toHaveBeenCalled();
    });
  });
});
