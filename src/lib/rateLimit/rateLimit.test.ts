/**
 * @jest-environment node
 */

/**
 * レート制限ユーティリティ テスト
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { checkRateLimit, resetRateLimit } from './rateLimit';
import { SUPABASE_ERROR_CODE } from '@/constants';

// --- Helpers ---

/**
 * Supabaseクライアントのチェーンメソッドモックを作成
 */
function createMockSupabase() {
  const mockEq = jest.fn();
  const mockSingle = jest.fn();
  const mockSelect = jest.fn();
  const mockInsert = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockFrom = jest.fn();

  // チェーンメソッドのデフォルト設定
  mockEq.mockReturnThis();
  mockSelect.mockReturnValue({ eq: mockEq });
  mockInsert.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockDelete.mockReturnValue({ eq: mockEq });

  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  });

  return {
    supabase: { from: mockFrom } as unknown as SupabaseClient,
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
    mockInsert,
    mockUpdate,
    mockDelete,
  };
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('レコード未存在時に新規作成してallowed=trueを返す', async () => {
    const { supabase, mockFrom } = createMockSupabase();

    // select→eq→eq→single のチェーン: レコード未検出
    const mockSingleFn = jest.fn().mockResolvedValue({
      data: null,
      error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
    });
    const mockEq2 = jest.fn().mockReturnValue({ single: mockSingleFn });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEq1 });

    mockFrom.mockReturnValueOnce({ select: mockSelectFn }).mockReturnValueOnce({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    const result = await checkRateLimit(supabase, 'user-1', 'login');

    expect(result).toEqual({ allowed: true });
    expect(mockFrom).toHaveBeenCalledWith('rate_limits');
  });

  it('ロック中の場合にallowed=falseとretryAfterを返す', async () => {
    const { supabase, mockFrom } = createMockSupabase();

    // ロック中: locked_until が現在時刻より未来
    const lockedUntil = new Date('2026-01-01T00:05:00.000Z').toISOString();
    const mockSingleFn = jest.fn().mockResolvedValue({
      data: {
        id: 'record-1',
        attempts: 4,
        locked_until: lockedUntil,
      },
      error: null,
    });
    const mockEq2 = jest.fn().mockReturnValue({ single: mockSingleFn });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEq1 });

    mockFrom.mockReturnValueOnce({ select: mockSelectFn });

    const result = await checkRateLimit(supabase, 'user-1', 'login');

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(300); // 5分 = 300秒
  });

  it('ロック期間を過ぎている場合にリセットしてallowed=trueを返す', async () => {
    const { supabase, mockFrom } = createMockSupabase();

    // ロック期間が過ぎている: locked_until が現在時刻より過去
    const lockedUntil = new Date('2025-12-31T23:00:00.000Z').toISOString();
    const mockSingleFn = jest.fn().mockResolvedValue({
      data: {
        id: 'record-1',
        attempts: 4,
        locked_until: lockedUntil,
      },
      error: null,
    });
    const mockEq2 = jest.fn().mockReturnValue({ single: mockSingleFn });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEq1 });

    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });

    mockFrom
      .mockReturnValueOnce({ select: mockSelectFn })
      .mockReturnValueOnce({ update: mockUpdate });

    const result = await checkRateLimit(supabase, 'user-1', 'login');

    expect(result).toEqual({ allowed: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      attempts: 1,
      locked_until: null,
      last_attempt_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    });
  });

  it('最大試行回数に到達した場合にロックしてallowed=falseを返す', async () => {
    const { supabase, mockFrom } = createMockSupabase();

    const mockSingleFn = jest.fn().mockResolvedValue({
      data: {
        id: 'record-1',
        attempts: 3,
        locked_until: null,
      },
      error: null,
    });
    const mockEq2 = jest.fn().mockReturnValue({ single: mockSingleFn });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEq1 });

    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });

    mockFrom
      .mockReturnValueOnce({ select: mockSelectFn })
      .mockReturnValueOnce({ update: mockUpdate });

    const result = await checkRateLimit(supabase, 'user-1', 'login', 3, 30);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(1800); // 30分 = 1800秒
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 4,
        locked_until: expect.any(String),
      }),
    );
  });

  it('通常のインクリメントでallowed=trueを返す', async () => {
    const { supabase, mockFrom } = createMockSupabase();

    const mockSingleFn = jest.fn().mockResolvedValue({
      data: {
        id: 'record-1',
        attempts: 1,
        locked_until: null,
      },
      error: null,
    });
    const mockEq2 = jest.fn().mockReturnValue({ single: mockSingleFn });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEq1 });

    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });

    mockFrom
      .mockReturnValueOnce({ select: mockSelectFn })
      .mockReturnValueOnce({ update: mockUpdate });

    const result = await checkRateLimit(supabase, 'user-1', 'login', 3, 30);

    expect(result).toEqual({ allowed: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      attempts: 2,
      last_attempt_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    });
  });

  it('不明なエラーの場合にエラーをthrowする', async () => {
    const { supabase, mockFrom } = createMockSupabase();

    const dbError = { code: 'UNKNOWN', message: 'DB error' };
    const mockSingleFn = jest.fn().mockResolvedValue({
      data: null,
      error: dbError,
    });
    const mockEq2 = jest.fn().mockReturnValue({ single: mockSingleFn });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelectFn = jest.fn().mockReturnValue({ eq: mockEq1 });

    mockFrom.mockReturnValueOnce({ select: mockSelectFn });

    await expect(checkRateLimit(supabase, 'user-1', 'login')).rejects.toEqual(
      dbError,
    );
  });
});

describe('resetRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rate_limitsテーブルからレコードを削除する', async () => {
    const mockEq2 = jest.fn().mockResolvedValue({ error: null });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    const mockDelete = jest.fn().mockReturnValue({ eq: mockEq1 });
    const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    await resetRateLimit(supabase, 'user-1', 'login');

    expect(mockFrom).toHaveBeenCalledWith('rate_limits');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq1).toHaveBeenCalledWith('identifier', 'user-1');
    expect(mockEq2).toHaveBeenCalledWith('action_type', 'login');
  });
});
