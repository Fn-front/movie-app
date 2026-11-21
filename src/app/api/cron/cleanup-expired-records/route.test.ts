/**
 * @jest-environment node
 */

/**
 * 保持期間切れレコードの削除 Cron API テスト
 *
 * SQL の削除条件そのもの（ロック中・カウント中の行を消さないこと）は実DBでしか
 * 検証できないため、`e2e/rateLimit/rateLimitsRetention.spec.ts` が担当する。
 * ここはルートの責務（認証・DB接続失敗・失敗の扱い・レスポンス形）を見る。
 */

import { NextRequest } from 'next/server';

import { GET, maxDuration, dynamic } from './route';

// --- Mocks ---

/**
 * ⚠️ 通知をモックする（#979）。
 *
 * モックしないと `handleCronError` から **実際に Resend API を叩く**。
 * jest は next/jest 経由で `.env.local` を読むので、`RESEND_API_KEY` と
 * `CRON_ALERT_EMAIL` が入っている手元では**本物のメールが飛ぶ**。
 */
const mockNotifyCronFailure = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/cron/notifyCronFailure', () => ({
  notifyCronFailure: (...args: unknown[]) => mockNotifyCronFailure(...args),
}));

const mockCleanupExpiredRecords = jest.fn();
jest.mock('@/lib/cleanup/expiredRecords', () => ({
  cleanupExpiredRecords: (...args: unknown[]) =>
    mockCleanupExpiredRecords(...args),
}));

/** 対象1つぶんの結果を作る */
const target = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  retention_hours: 48,
  deleted_count: 0,
  completed: true,
  ...overrides,
});

const mockCreateServiceRoleClient = jest.fn();
jest.mock('@/helpers/supabase', () => {
  const actual = jest.requireActual('@/helpers/supabase');
  return {
    ...actual,
    createServiceRoleClient: () => mockCreateServiceRoleClient(),
  };
});

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/cron/cleanup-expired-records', {
    headers,
  });
};

// --- Tests ---

describe('GET /api/cron/cleanup-expired-records', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
    mockCreateServiceRoleClient.mockReturnValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('maxDurationが60に設定されている', () => {
    expect(maxDuration).toBe(60);
  });

  it('dynamicがforce-dynamicに設定されている', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('正しい認証で全対象を掃除し、対象ごとの結果を返す', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCleanupExpiredRecords.mockResolvedValue({
      targets: [
        target('rate_limits', { deleted_count: 12 }),
        target('otp_codes', { deleted_count: 3 }),
        target('password_reset_tokens', { deleted_count: 1 }),
      ],
      completed: true,
      hasError: false,
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.completed).toBe(true);
    // ⚠️ 対象名を本文に載せる。件数だけだと「どのテーブルが消えていないか」が
    //   分からず、#978 のように「掃除しているつもりで対象外」に気づけない
    expect(json.data.targets.map((t: { name: string }) => t.name)).toEqual([
      'rate_limits',
      'otp_codes',
      'password_reset_tokens',
    ]);
  });

  it('打ち切られても200で返し、completed:false をそのまま載せる', async () => {
    // ⚠️ 打ち切りは throw ではなく「200 + completed:false」で返す契約（#1342）。
    // 消し残しは保持期間を超えた個人データが残っている状態なので、
    // 監視側が本文で気づけるようにしてある。throw に変えられたら落ちること
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCleanupExpiredRecords.mockResolvedValue({
      targets: [
        target('rate_limits', { deleted_count: 100_000, completed: false }),
      ],
      completed: false,
      hasError: false,
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.completed).toBe(false);

    // ⚠️ 200 のまま**通知はする**（#433）。対象が7つになって35秒の予算を
    //    分け合うため、先頭が滞留すると末尾は毎日0件で終わる。
    //    ステータスコードしか見ない監視からは完走と区別がつかない
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        cronName: 'cleanup-expired-records',
        reason: expect.stringContaining('消し残し'),
        // ⚠️ 200 で返している実行なので「失敗」と名乗らせない。
        //    連投抑止のカウンタも失敗とは別になる
        severity: 'incomplete',
      }),
    );
    expect(mockNotifyCronFailure.mock.calls[0]?.[1].reason).toContain(
      'rate_limits',
    );
  });

  it('完走したら通知しない', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCleanupExpiredRecords.mockResolvedValue({
      targets: [target('rate_limits', { deleted_count: 3 })],
      completed: true,
      hasError: false,
    });

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(200);
    expect(mockNotifyCronFailure).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 失敗と打ち切りが同時に起きたら、**失敗のほうを通知する**。
   *
   * 打ち切りは翌日のCRONが続きを消すが、失敗は権限不足や関数の欠落など
   * 放っておいても直らないものが多い。
   */
  it('失敗と打ち切りが同時なら失敗を通知する', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCleanupExpiredRecords.mockResolvedValue({
      targets: [
        target('rate_limits', { completed: false }),
        target('favorites', {
          completed: false,
          error: 'function does not exist',
        }),
      ],
      completed: false,
      hasError: true,
    });

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);

    const notice = mockNotifyCronFailure.mock.calls[0]?.[1];
    expect(notice.severity).toBe('failure');
    expect(notice.reason).toContain('削除に失敗');
    // ⚠️ 失敗と同時でも打ち切り対象名を落とさない。落とすと失敗が続く間
    //    消し残しの存在が一度も報告されない
    expect(notice.reason).toContain('消し残し');
    expect(notice.reason).toContain('rate_limits');
  });

  /**
   * ⚠️ 打ち切り（200）と RPC の失敗（500）を分ける。
   *
   * 打ち切りは「翌日のCRONが続きを消す」で回復するが、失敗は権限不足や
   * 関数の欠落など設定の問題が多く、放っておいても直らない。
   */
  it('1つでも失敗したら500で返し、成功した対象の結果は残す', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCleanupExpiredRecords.mockResolvedValue({
      targets: [
        target('rate_limits', { deleted_count: 12 }),
        target('otp_codes', {
          completed: false,
          error: 'function does not exist',
        }),
      ],
      completed: false,
      hasError: true,
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    // 失敗しても、成功した対象の削除件数は捨てない
    expect(json.data.targets[0].deleted_count).toBe(12);
    expect(json.data.targets[1].error).toBe('function does not exist');
    // ⚠️ 通知を消したらここが落ちる（#979）
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'cleanup-expired-records' }),
    );
  });

  it('削除対象が無くても成功で返す', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCleanupExpiredRecords.mockResolvedValue({
      targets: [target('rate_limits')],
      completed: true,
      hasError: false,
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.targets[0].deleted_count).toBe(0);
  });

  it('認証ヘッダが無いと401で、削除は実行されない', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mockCleanupExpiredRecords).not.toHaveBeenCalled();
    // ⛔ ヘッダが無いだけでは通知しない。/api/cron/* は誰でも叩けるので、
    //    ここで通知すると外部から1日1通の枠を使い切らせられる（#979）
    expect(mockNotifyCronFailure).not.toHaveBeenCalled();
  });

  it('認証トークンが違うと401で、削除は実行されない', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
    expect(mockCleanupExpiredRecords).not.toHaveBeenCalled();
  });

  it('service role クライアントを作れないとDB接続エラーを返す', async () => {
    mockCreateServiceRoleClient.mockReturnValue(null);

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);
    // ⚠️ 通知を消したらここが落ちる（#979）。
    //    個人データの消去が止まったことに気づけないのが問題そのもの
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'cleanup-expired-records' }),
    );
    expect(mockCleanupExpiredRecords).not.toHaveBeenCalled();
  });

  it('想定外の例外でも500を返す（成功扱いにしない）', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCleanupExpiredRecords.mockRejectedValue(new Error('rpc failed'));

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    // 個人データの消去なので、失敗を握りつぶして success:true にしない
    expect(response.status).toBe(500);

    // ⚠️ 500 を返すだけで終わらせない（#979）。
    //   通知の呼び出しを消したらここが落ちる
    expect(mockNotifyCronFailure.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cronName: 'cleanup-expired-records' }),
    );
    expect(json.success).toBe(false);
  });
});
