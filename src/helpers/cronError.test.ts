/**
 * @jest-environment node
 */

/**
 * handleCronError テスト（#979）
 *
 * ここで固定したいのは「500 を返すだけで終わらせない」こと。
 * 通知の呼び出しを消してもテストが落ちない状態だと、
 * **CRON が静かに死んでいる**という元の問題に戻る。
 */

// --- Mocks ---

const mockNotifyCronFailure = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/cron/notifyCronFailure', () => ({
  notifyCronFailure: (...args: unknown[]) => mockNotifyCronFailure(...args),
}));

const mockCreateServiceRoleClient = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

import { handleCronError } from './cronError';

// --- Helpers ---

const supabase = { tag: 'service-role' };

describe('handleCronError', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifyCronFailure.mockResolvedValue(true);
    mockCreateServiceRoleClient.mockReturnValue(supabase);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('500 を返す', async () => {
    const response = await handleCronError(
      new Error('boom'),
      'sync-movies',
      '同期に失敗しました',
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.message).toBe('同期に失敗しました');
  });

  it('CRON 名と例外のメッセージを載せて通知する', async () => {
    await handleCronError(
      new Error('boom'),
      'sync-movies',
      '同期に失敗しました',
    );

    expect(mockNotifyCronFailure).toHaveBeenCalledWith(supabase, {
      cronName: 'sync-movies',
      reason: 'boom',
    });
  });

  /**
   * ⚠️ 通知の本文に出るのは**例外のメッセージ**。
   * 利用者向けのメッセージを渡すと、どの CRON も同じ文面になって
   * 原因の切り分けに使えない。
   */
  it('Error でない値も理由として送る', async () => {
    await handleCronError(
      '文字列で投げられた',
      'sync-movies',
      '同期に失敗しました',
    );

    expect(mockNotifyCronFailure).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ reason: '文字列で投げられた' }),
    );
  });

  /**
   * ⚠️ service role クライアントは**ここで作り直す**。
   * 呼び出し元の `supabase` は try の内側にあり catch から見えないし、
   * 「クライアントを作れないこと」自体が失敗の原因でありうる。
   * 作れなければ連投抑止を諦めて送る（null を渡す）。
   */
  it('クライアントを作れなくても通知する', async () => {
    mockCreateServiceRoleClient.mockReturnValue(null);

    await handleCronError(
      new Error('boom'),
      'sync-movies',
      '同期に失敗しました',
    );

    expect(mockNotifyCronFailure).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ cronName: 'sync-movies' }),
    );
  });

  /**
   * ⚠️ **通知の結果でレスポンスを変えない。**
   *
   * 通知が送れなくても CRON が失敗した事実は変わらない。ここで分岐すると
   * 「通知の失敗」と「CRON の失敗」が混ざって原因が読めなくなる。
   */
  it('通知が送れなくても 500 を返す', async () => {
    mockNotifyCronFailure.mockResolvedValue(false);

    const response = await handleCronError(
      new Error('boom'),
      'sync-movies',
      '同期に失敗しました',
    );

    expect(response.status).toBe(500);
  });

  /**
   * ⚠️ 投げっぱなしにしない。Vercel Function は応答を返した時点で
   * 止まりうるので、await して送り切る。
   */
  it('通知を await してから返す', async () => {
    let sent = false;
    mockNotifyCronFailure.mockImplementation(async () => {
      await Promise.resolve();
      sent = true;
      return true;
    });

    await handleCronError(
      new Error('boom'),
      'sync-movies',
      '同期に失敗しました',
    );

    expect(sent).toBe(true);
  });
});
