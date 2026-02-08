/**
 * @jest-environment node
 */

import { AxiosError, AxiosHeaders } from 'axios';

import {
  handleApiError,
  formatErrorMessage,
  isNetworkError,
  isAuthError,
} from './error';

function createAxiosError(
  status: number,
  code?: string,
  data?: unknown,
): AxiosError {
  const headers = new AxiosHeaders();
  const error = new AxiosError(
    'Request failed',
    code,
    { headers, url: '/test', method: 'get' },
    null,
    {
      status,
      data: data ?? {},
      statusText: 'Error',
      headers: {},
      config: { headers },
    } as any,
  );
  return error;
}

describe('handleApiError', () => {
  it('AxiosErrorからErrorResponseを返す', () => {
    const error = createAxiosError(404, 'ERR_BAD_REQUEST', {
      detail: 'Not found',
    });
    const result = handleApiError(error);

    expect(result.message).toBe('要求されたリソースが見つかりませんでした');
    expect(result.statusCode).toBe(404);
    expect(result.details).toEqual({ detail: 'Not found' });
  });

  it('ResponseからErrorResponseを返す', () => {
    const response = new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
    const result = handleApiError(response);

    expect(result.message).toBe('HTTPエラー: 500 Internal Server Error');
    expect(result.statusCode).toBe(500);
  });

  it('ErrorからErrorResponseを返す', () => {
    const error = new Error('something went wrong');
    const result = handleApiError(error);

    expect(result.message).toBe('something went wrong');
    expect(result.statusCode).toBeUndefined();
  });

  it('未知のエラーからデフォルトメッセージを返す', () => {
    const result = handleApiError('unknown error');

    expect(result.message).toBe('予期しないエラーが発生しました');
  });
});

describe('formatErrorMessage', () => {
  it('AxiosError 400の場合、入力エラーメッセージを返す', () => {
    const error = createAxiosError(400);
    expect(formatErrorMessage(error)).toBe('入力内容に誤りがあります');
  });

  it('AxiosError 401の場合、認証エラーメッセージを返す', () => {
    const error = createAxiosError(401);
    expect(formatErrorMessage(error)).toBe(
      '認証に失敗しました。再度ログインしてください',
    );
  });

  it('AxiosError 403の場合、権限エラーメッセージを返す', () => {
    const error = createAxiosError(403);
    expect(formatErrorMessage(error)).toBe('アクセス権限がありません');
  });

  it('AxiosError 404の場合、リソース不在メッセージを返す', () => {
    const error = createAxiosError(404);
    expect(formatErrorMessage(error)).toBe(
      '要求されたリソースが見つかりませんでした',
    );
  });

  it('AxiosError 408の場合、タイムアウトメッセージを返す', () => {
    const error = createAxiosError(408);
    expect(formatErrorMessage(error)).toBe('リクエストがタイムアウトしました');
  });

  it('AxiosError 429の場合、レート制限メッセージを返す', () => {
    const error = createAxiosError(429);
    expect(formatErrorMessage(error)).toBe(
      'リクエストが多すぎます。しばらく待ってから再度お試しください',
    );
  });

  it('AxiosError 500の場合、サーバーエラーメッセージを返す', () => {
    const error = createAxiosError(500);
    expect(formatErrorMessage(error)).toBe('サーバーエラーが発生しました');
  });

  it('AxiosError 502の場合、通信失敗メッセージを返す', () => {
    const error = createAxiosError(502);
    expect(formatErrorMessage(error)).toBe('サーバーとの通信に失敗しました');
  });

  it('AxiosError 503の場合、サービス利用不可メッセージを返す', () => {
    const error = createAxiosError(503);
    expect(formatErrorMessage(error)).toBe('サービスが一時的に利用できません');
  });

  it('AxiosError ERR_NETWORKの場合、ネットワークエラーメッセージを返す', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(formatErrorMessage(error)).toBe(
      'ネットワークエラーが発生しました。接続を確認してください',
    );
  });

  it('AxiosError ECONNABORTEDの場合、タイムアウトメッセージを返す', () => {
    const error = new AxiosError('timeout', 'ECONNABORTED');
    expect(formatErrorMessage(error)).toBe('リクエストがタイムアウトしました');
  });

  it('Responseオブジェクトからメッセージを返す', () => {
    const response = new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
    expect(formatErrorMessage(response)).toBe('サーバーエラーが発生しました');
  });

  it('Errorオブジェクトからerror.messageを返す', () => {
    const error = new Error('custom error message');
    expect(formatErrorMessage(error)).toBe('custom error message');
  });

  it('未知のエラーからデフォルトメッセージを返す', () => {
    expect(formatErrorMessage('unknown')).toBe(
      '予期しないエラーが発生しました',
    );
  });
});

describe('isNetworkError', () => {
  it('AxiosError ERR_NETWORKの場合trueを返す', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(isNetworkError(error)).toBe(true);
  });

  it('その他のAxiosErrorの場合falseを返す', () => {
    const error = createAxiosError(500);
    expect(isNetworkError(error)).toBe(false);
  });

  it('AxiosError以外の場合falseを返す', () => {
    expect(isNetworkError(new Error('error'))).toBe(false);
  });
});

describe('isAuthError', () => {
  it('AxiosError 401の場合trueを返す', () => {
    const error = createAxiosError(401);
    expect(isAuthError(error)).toBe(true);
  });

  it('Response 401の場合trueを返す', () => {
    const response = new Response(null, { status: 401 });
    expect(isAuthError(response)).toBe(true);
  });

  it('AxiosError 403の場合falseを返す', () => {
    const error = createAxiosError(403);
    expect(isAuthError(error)).toBe(false);
  });

  it('その他のエラーの場合falseを返す', () => {
    expect(isAuthError(new Error('error'))).toBe(false);
  });
});
