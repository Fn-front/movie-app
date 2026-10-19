/**
 * @jest-environment node
 */

/**
 * レート制限ユーティリティ テスト
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { checkCooldown, checkRateLimit, resetRateLimit } from './rateLimit';
import { SUPABASE_ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';

// --- Helpers ---

describe('checkRateLimit', () => {
  /** RPC の戻り値をモックした Supabase クライアントを作る */
  function createRpcSupabase(result: {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
  }) {
    const rpc = jest.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    });

    return { supabase: { rpc } as unknown as SupabaseClient, rpc };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consume_rate_limit RPC に識別子・アクション・閾値を渡す', async () => {
    const { supabase, rpc } = createRpcSupabase({
      data: [{ allowed: true, retry_after: null }],
    });

    await checkRateLimit(supabase, 'user-1', 'login', 5, 30);

    expect(rpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_identifier: 'user-1',
      p_action_type: 'login',
      p_max_attempts: 5,
      p_window_minutes: 30,
    });
  });

  it('許可された場合 allowed=true を返す', async () => {
    const { supabase } = createRpcSupabase({
      data: [{ allowed: true, retry_after: null }],
    });

    expect(await checkRateLimit(supabase, 'user-1', 'login')).toEqual({
      allowed: true,
    });
  });

  it('拒否された場合 allowed=false と retryAfter を返す', async () => {
    const { supabase } = createRpcSupabase({
      data: [{ allowed: false, retry_after: 1800 }],
    });

    expect(await checkRateLimit(supabase, 'user-1', 'login')).toEqual({
      allowed: false,
      retryAfter: 1800,
    });
  });

  it('RPC が配列でなくオブジェクトを返しても扱える', async () => {
    const { supabase } = createRpcSupabase({
      data: { allowed: false, retry_after: 60 },
    });

    expect(await checkRateLimit(supabase, 'user-1', 'login')).toEqual({
      allowed: false,
      retryAfter: 60,
    });
  });

  it('デフォルトの閾値を使う（引数省略時）', async () => {
    const { supabase, rpc } = createRpcSupabase({
      data: [{ allowed: true, retry_after: null }],
    });

    await checkRateLimit(supabase, 'user-1', 'login');

    expect(rpc).toHaveBeenCalledWith(
      'consume_rate_limit',
      expect.objectContaining({ p_max_attempts: 3, p_window_minutes: 30 }),
    );
  });

  describe('エラー時の扱い', () => {
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('CHECK制約違反(23514)を専用メッセージで記録する', async () => {
      const { supabase } = createRpcSupabase({
        error: { code: '23514', message: 'violates chk_action_type' },
      });

      const result = await checkRateLimit(supabase, 'user-1', 'login');

      expect(result).toEqual({ allowed: true });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('この制限は機能していません'),
        expect.anything(),
      );
    });

    it('その他のエラーも記録し、素通しは無言にしない', async () => {
      const { supabase } = createRpcSupabase({
        error: { code: '08006', message: 'connection failure' },
      });

      const result = await checkRateLimit(supabase, 'user-1', 'login');

      expect(result).toEqual({ allowed: true });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('RPCが行を返さない場合も記録する', async () => {
      const { supabase } = createRpcSupabase({ data: [] });

      const result = await checkRateLimit(supabase, 'user-1', 'login');

      expect(result).toEqual({ allowed: true });
      expect(errorSpy).toHaveBeenCalled();
    });

    describe('RPC未適用時のフォールバック（42883）', () => {
      /** RPC は 42883 で失敗し、テーブル操作は旧実装どおり動くクライアント */
      function createFallbackSupabase(row: Record<string, unknown> | null) {
        const update = jest.fn().mockReturnValue({ eq: jest.fn() });
        const insert = jest.fn().mockResolvedValue({ error: null });
        const from = jest.fn().mockReturnValue({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => ({
                  data: row,
                  error: row ? null : { code: SUPABASE_ERROR_CODE.NOT_FOUND },
                }),
              }),
            }),
          }),
          update,
          insert,
        });

        const rpc = jest.fn().mockResolvedValue({
          data: null,
          error: { code: '42883', message: 'function does not exist' },
        });

        return {
          supabase: { rpc, from } as unknown as SupabaseClient,
          update,
          insert,
        };
      }

      it('RPCが無ければ旧実装で判定を続ける（素通しにしない）', async () => {
        const { supabase, update } = createFallbackSupabase({
          id: 'r1',
          attempts: 3,
          locked_until: null,
        });

        const result = await checkRateLimit(supabase, 'user-1', 'login', 3, 30);

        // 旧実装どおり上限到達でロックされる
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBe(1800);
        expect(update).toHaveBeenCalled();
      });

      it('フォールバックしたことを警告として記録する', async () => {
        const { supabase } = createFallbackSupabase({
          id: 'r1',
          attempts: 1,
          locked_until: null,
        });

        await checkRateLimit(supabase, 'user-1', 'login');

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('20261017040000'),
        );
      });

      it('フォールバックでも行が無ければ作成して許可する', async () => {
        const { supabase, insert } = createFallbackSupabase(null);

        const result = await checkRateLimit(supabase, 'user-1', 'login');

        expect(result).toEqual({ allowed: true });
        expect(insert).toHaveBeenCalled();
      });
    });
  });
});

describe('checkCooldown', () => {
  const NOW = '2026-01-01T00:00:00.000Z';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * select→eq→eq→single のチェーンモックを組み立てる
   */
  function mockSelectChain(result: {
    data: unknown;
    error: unknown;
  }): jest.Mock {
    const mockSingleFn = jest.fn().mockResolvedValue(result);
    const mockEq2 = jest.fn().mockReturnValue({ single: mockSingleFn });
    const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
    return jest.fn().mockReturnValue({ eq: mockEq1 });
  }

  it('レコード未存在時は初回とみなしallowed=trueを返す', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ error: null });
    const mockFrom = jest
      .fn()
      .mockReturnValueOnce({
        select: mockSelectChain({
          data: null,
          error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
        }),
      })
      .mockReturnValueOnce({ insert: mockInsert });
    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    expect(result).toEqual({ allowed: true });
    expect(mockFrom).toHaveBeenCalledWith('rate_limits');
    expect(mockInsert).toHaveBeenCalledWith({
      identifier: 'user-1',
      action_type: RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      attempts: 1,
      last_attempt_at: NOW,
    });
  });

  it('クールダウン中はallowed=falseと残り秒数を返す', async () => {
    // 20秒前に呼び出し済み → 60秒クールダウンなら残り40秒
    const mockFrom = jest.fn().mockReturnValueOnce({
      select: mockSelectChain({
        data: {
          id: 'record-1',
          last_attempt_at: '2025-12-31T23:59:40.000Z',
        },
        error: null,
      }),
    });
    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    expect(result).toEqual({ allowed: false, retryAfter: 40 });
  });

  it('境界値: クールダウン満了の1ms手前は拒否する', async () => {
    const mockFrom = jest.fn().mockReturnValueOnce({
      select: mockSelectChain({
        data: {
          id: 'record-1',
          last_attempt_at: '2025-12-31T23:59:00.001Z',
        },
        error: null,
      }),
    });
    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(1);
  });

  it('境界値: クールダウン満了ちょうどは許可し時刻を更新する', async () => {
    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });
    const mockFrom = jest
      .fn()
      .mockReturnValueOnce({
        select: mockSelectChain({
          data: {
            id: 'record-1',
            last_attempt_at: '2025-12-31T23:59:00.000Z',
          },
          error: null,
        }),
      })
      .mockReturnValueOnce({ update: mockUpdate });
    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    expect(result).toEqual({ allowed: true });
    expect(mockUpdate).toHaveBeenCalledWith({ last_attempt_at: NOW });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'record-1');
  });

  it('拒否時は last_attempt_at を更新しない（連打でクールダウンが延びない）', async () => {
    const mockUpdate = jest.fn();
    const mockFrom = jest.fn().mockReturnValue({
      select: mockSelectChain({
        data: {
          id: 'record-1',
          last_attempt_at: '2025-12-31T23:59:50.000Z',
        },
        error: null,
      }),
      update: mockUpdate,
    });
    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  describe('非UTC環境での解釈（last_attempt_at は TIMESTAMPTZ である前提）', () => {
    const ORIGINAL_TZ = process.env.TZ;

    afterEach(() => {
      process.env.TZ = ORIGINAL_TZ;
    });

    /** 20秒前の時刻を指定形式で返したクライアントで checkCooldown を実行する */
    async function runWithLastAttemptAt(lastAttemptAt: string) {
      const mockFrom = jest.fn().mockReturnValue({
        select: mockSelectChain({
          data: { id: 'record-1', last_attempt_at: lastAttemptAt },
          error: null,
        }),
        update: jest.fn().mockReturnValue({ eq: jest.fn() }),
      });

      return checkCooldown(
        { from: mockFrom } as unknown as SupabaseClient,
        'user-1',
        RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
        60,
      );
    }

    // PostgREST は TIMESTAMPTZ をUTCオフセット付きで返す。
    // オフセットがあれば JS の解釈はサーバーのタイムゾーンに依存しない。
    it.each(['Asia/Tokyo', 'UTC', 'America/New_York'])(
      'TZ=%s でもオフセット付きの値から同じ残り秒数を算出する',
      async (tz) => {
        process.env.TZ = tz;

        expect(await runWithLastAttemptAt('2025-12-31T23:59:40+00:00')).toEqual(
          { allowed: false, retryAfter: 40 },
        );
      },
    );

    // カラムを naive TIMESTAMP に戻すとオフセットが落ち、JS がローカル時刻として
    // 解釈する。JST では実時刻より9時間古く見えるためクールダウンが素通りする。
    // マイグレーション 20261019012324 が必要である根拠をテストとして残す（#759）。
    it('オフセットが無い値はJSTで経過時間を誤り、クールダウンが素通りする', async () => {
      process.env.TZ = 'Asia/Tokyo';

      expect(await runWithLastAttemptAt('2025-12-31T23:59:40')).toEqual({
        allowed: true,
      });
    });
  });

  it('NOT_FOUND以外のDBエラーはthrowする', async () => {
    const dbError = { code: 'OTHER_ERROR', message: 'DB error' };
    const mockFrom = jest.fn().mockReturnValueOnce({
      select: mockSelectChain({ data: null, error: dbError }),
    });
    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    await expect(
      checkCooldown(
        supabase,
        'user-1',
        RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
        60,
      ),
    ).rejects.toEqual(dbError);
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

describe('checkCooldown の INSERT 失敗時の記録（fail-openの可視化）', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  /** NOT_FOUND を返して INSERT 分岐に入らせ、その INSERT を失敗させる */
  function createSupabaseWithFailingInsert(
    error: { code: string; message: string } | null,
  ) {
    const mockInsert = jest.fn().mockResolvedValue({ error });
    const mockFrom = jest
      .fn()
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => ({
                data: null,
                error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({ insert: mockInsert });

    return { from: mockFrom } as unknown as SupabaseClient;
  }

  it('CHECK制約違反(23514)を専用メッセージで記録する', async () => {
    const supabase = createSupabaseWithFailingInsert({
      code: '23514',
      message: 'violates check constraint "chk_action_type"',
    });

    const result = await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    // 現状は fail-open のままだが、無言ではなくなる
    expect(result).toEqual({ allowed: true });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('この制限は機能していません'),
      expect.anything(),
    );
  });

  it('CHECK制約違反以外のエラーも記録する', async () => {
    const supabase = createSupabaseWithFailingInsert({
      code: '08006',
      message: 'connection failure',
    });

    await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('insert failed'),
      expect.anything(),
    );
  });

  it('INSERTが成功した場合は何も記録しない', async () => {
    const supabase = createSupabaseWithFailingInsert(null);

    await checkCooldown(
      supabase,
      'user-1',
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      60,
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
