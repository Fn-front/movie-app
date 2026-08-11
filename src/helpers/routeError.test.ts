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

  it('境界値: unknown 型のエラー(文字列/オブジェクト)でも 500 を返せる', async () => {
    const responseStr = handleRouteError('string error', 'p1', 'msg1');
    const jsonStr = await responseStr.json();
    expect(responseStr.status).toBe(500);
    expect(jsonStr.error.code).toBe('SERVER_ERROR');
    expect(jsonStr.error.message).toBe('msg1');

    const responseObj = handleRouteError({ raw: 'obj' }, 'p2', 'msg2');
    const jsonObj = await responseObj.json();
    expect(responseObj.status).toBe(500);
    expect(jsonObj.error.message).toBe('msg2');
  });

  it('境界値: null/undefined エラーでもクラッシュしない', async () => {
    const responseNull = handleRouteError(null, 'p', 'msg');
    expect(responseNull.status).toBe(500);

    const responseUndef = handleRouteError(undefined, 'p', 'msg');
    expect(responseUndef.status).toBe(500);
  });
});
