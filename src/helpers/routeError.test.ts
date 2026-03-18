/**
 * @jest-environment node
 */

/**
 * handleRouteError テスト
 */

import { handleRouteError } from './routeError';

describe('handleRouteError', () => {
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it('500ステータスのエラーレスポンスを返す', async () => {
    const error = new Error('test error');
    const response = handleRouteError(error, 'Test prefix', 'テストエラー');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
    expect(json.error.message).toBe('テストエラー');
  });

  it('エラーをconsole.errorに出力する', () => {
    const error = new Error('log test');
    handleRouteError(error, 'Log prefix', 'メッセージ');

    expect(consoleSpy).toHaveBeenCalledWith('Log prefix:', error);
  });
});
