/**
 * バッチ更新ロジックのテスト
 */

// モック定義（importより前に記述）
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/tmdb/tmdb', () => ({
  getMovieDetail: jest.fn(),
}));

import { createClient } from '@supabase/supabase-js';

import { getMovieDetail } from '@/lib/tmdb/tmdb';
import {
  updateMoviesCacheByBatch,
  type BatchUpdateResult,
} from './updateMoviesCacheByBatch';

// ---------- ヘルパー ----------

/** テスト用の映画詳細データを生成する */
function createMockMovieDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'テスト映画',
    vote_average: 8.0,
    popularity: 150.5,
    ...overrides,
  };
}

/**
 * Supabaseのfromモックを構築する
 */
function createFromMock(options: {
  selectData?: { id: number; release_type: string }[];
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const { selectData = [], selectError = null, updateError = null } = options;

  const fromMock = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({
      data: selectData,
      error: selectError,
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        error: updateError,
      }),
    }),
  });

  return fromMock;
}

// ---------- 環境変数の保存・復元 ----------

const originalEnv = { ...process.env };

function setValidEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
}

// ---------- テスト ----------

describe('updateMoviesCacheByBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ---- 型テスト ----

  it('BatchUpdateResultの型が期待通りであること', () => {
    const result: BatchUpdateResult = {
      total: 100,
      updated: 95,
      errors: ['ID 1: error'],
    };

    expect(result.total).toBe(100);
    expect(result.updated).toBe(95);
    expect(result.errors).toHaveLength(1);
  });

  // ---- 環境変数チェック ----

  describe('環境変数チェック', () => {
    it('NEXT_PUBLIC_SUPABASE_URL が未設定の場合エラーをスローする', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });

    it('SUPABASE_SERVICE_ROLE_KEY が未設定の場合エラーをスローする', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });
  });

  // ---- 映画ID取得 ----

  describe('映画ID取得', () => {
    it('DB取得エラーの場合エラーをスローする', async () => {
      setValidEnv();

      const fromMock = createFromMock({
        selectError: { message: 'connection refused' },
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      await expect(updateMoviesCacheByBatch()).rejects.toThrow(
        '映画ID取得エラー: connection refused',
      );
    });

    it('映画データが0件の場合、空の結果を返す', async () => {
      setValidEnv();

      const fromMock = createFromMock({ selectData: [] });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('dataがnullの場合、空の結果を返す', async () => {
      setValidEnv();

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(0);
      expect(result.updated).toBe(0);
    });
  });

  // ---- バッチ更新処理 ----

  describe('バッチ更新処理', () => {
    it('TMDb APIから最新情報を取得しDBを更新する', async () => {
      setValidEnv();

      const rows = [
        { id: 1, release_type: 'theatrical' },
        { id: 2, release_type: 'theatrical' },
      ];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: rows, error: null }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieDetail as jest.Mock)
        .mockResolvedValueOnce(
          createMockMovieDetail({ id: 1, vote_average: 8.5, popularity: 200 }),
        )
        .mockResolvedValueOnce(
          createMockMovieDetail({ id: 2, vote_average: 7.0, popularity: 100 }),
        );

      const result = await updateMoviesCacheByBatch();

      expect(result.total).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(getMovieDetail).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          vote_average: 8.5,
          popularity: 200,
        }),
      );
    });

    it('同一IDで複数release_typeがある場合、ユニークIDで1回だけAPI呼び出しする', async () => {
      setValidEnv();

      const rows = [
        { id: 1, release_type: 'theatrical' },
        { id: 1, release_type: 'streaming' },
      ];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: rows, error: null }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieDetail as jest.Mock).mockResolvedValueOnce(
        createMockMovieDetail({ id: 1, vote_average: 9.0, popularity: 300 }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(getMovieDetail).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(2);
      expect(result.updated).toBe(2);
    });

    it('TMDb APIエラーの場合errorsに記録して処理を続行する', async () => {
      setValidEnv();

      const rows = [
        { id: 1, release_type: 'theatrical' },
        { id: 2, release_type: 'theatrical' },
      ];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: rows, error: null }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieDetail as jest.Mock)
        .mockRejectedValueOnce(new Error('Request failed with status 404'))
        .mockResolvedValueOnce(
          createMockMovieDetail({ id: 2, vote_average: 7.5, popularity: 120 }),
        );

      const result = await updateMoviesCacheByBatch();

      expect(result.updated).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('Request failed with status 404');
    });

    it('DB更新エラーの場合errorsに記録する', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];

      const updateMock = jest.fn().mockReturnValue({
        eq: jest
          .fn()
          .mockResolvedValue({ error: { message: 'update failed' } }),
      });
      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: rows, error: null }),
        update: updateMock,
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieDetail as jest.Mock).mockResolvedValueOnce(
        createMockMovieDetail({ id: 1 }),
      );

      const result = await updateMoviesCacheByBatch();

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('update failed');
    });

    it('非Errorオブジェクトがスローされた場合Unknown errorとして記録する', async () => {
      setValidEnv();

      const rows = [{ id: 1, release_type: 'theatrical' }];

      const fromMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: rows, error: null }),
      });
      (createClient as jest.Mock).mockReturnValue({ from: fromMock });

      (getMovieDetail as jest.Mock).mockRejectedValueOnce('string error');

      const result = await updateMoviesCacheByBatch();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ID 1');
      expect(result.errors[0]).toContain('Unknown error');
    });
  });
});
