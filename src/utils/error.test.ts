/**
 * @jest-environment node
 */

import { AxiosError, AxiosHeaders } from 'axios';

import {
  handleApiError,
  formatErrorMessage,
  isNetworkError,
  isAuthError,
  logError,
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
    } as unknown as import('axios').AxiosResponse,
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

  it('開発環境ではconsole.errorにエラーを出力する', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const error = new Error('dev error');
    handleApiError(error);

    expect(consoleSpy).toHaveBeenCalledWith('API Error:', error);

    consoleSpy.mockRestore();
    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('本番環境ではconsole.errorを呼ばない', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    handleApiError(new Error('prod error'));

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
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

  it('AxiosError 504(500以上のdefault)の場合、サーバーエラーメッセージを返す', () => {
    const error = createAxiosError(504);
    expect(formatErrorMessage(error)).toBe('サーバーエラーが発生しました');
  });

  it('AxiosError 405(400以上のdefault)の場合、リクエストエラーメッセージを返す', () => {
    const error = createAxiosError(405);
    expect(formatErrorMessage(error)).toBe('リクエストエラーが発生しました');
  });

  it('AxiosError カスタムメッセージがある場合、そのメッセージを返す', () => {
    const headers = new AxiosHeaders();
    const error = new AxiosError(
      'Request failed',
      undefined,
      { headers, url: '/test', method: 'get' },
      null,
      {
        status: undefined as unknown as number,
        data: { message: 'カスタムエラーメッセージ' },
        statusText: 'Error',
        headers: {},
        config: { headers },
      } as unknown as import('axios').AxiosResponse,
    );
    expect(formatErrorMessage(error)).toBe('カスタムエラーメッセージ');
  });

  it('AxiosError ステータスコードもコードもカスタムメッセージもない場合、error.messageを返す', () => {
    const error = new AxiosError('fallback message');
    expect(formatErrorMessage(error)).toBe('fallback message');
  });

  it('Response 400台の場合、リクエストエラーメッセージを返す', () => {
    const response = new Response(null, {
      status: 404,
      statusText: 'Not Found',
    });
    expect(formatErrorMessage(response)).toBe('リクエストエラーが発生しました');
  });

  it('Response 200台の場合、statusTextを含むメッセージを返す', () => {
    const response = new Response(null, {
      status: 301,
      statusText: 'Moved Permanently',
    });
    expect(formatErrorMessage(response)).toBe(
      'エラーが発生しました: Moved Permanently',
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

describe('logError', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('開発環境ではエラー詳細をconsoleに出力する', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const groupSpy = jest.spyOn(console, 'group').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const groupEndSpy = jest
      .spyOn(console, 'groupEnd')
      .mockImplementation(() => {});

    const error = new Error('test error');
    logError(error);

    expect(groupSpy).toHaveBeenCalledWith('🚨 Error Details');
    expect(errorSpy).toHaveBeenCalledWith('Error:', error);
    expect(groupEndSpy).toHaveBeenCalled();

    groupSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
  });

  it('開発環境でcontextが渡された場合、contextも出力する', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const groupSpy = jest.spyOn(console, 'group').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const groupEndSpy = jest
      .spyOn(console, 'groupEnd')
      .mockImplementation(() => {});

    const context = { component: 'MovieList', action: 'fetch' };
    logError(new Error('test'), context);

    expect(logSpy).toHaveBeenCalledWith('Context:', context);

    groupSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
  });

  it('開発環境でAxiosErrorの場合、レスポンス詳細も出力する', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const groupSpy = jest.spyOn(console, 'group').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const groupEndSpy = jest
      .spyOn(console, 'groupEnd')
      .mockImplementation(() => {});

    const axiosError = createAxiosError(500, undefined, {
      detail: 'server error',
    });
    logError(axiosError);

    expect(logSpy).toHaveBeenCalledWith('Response:', {
      detail: 'server error',
    });
    expect(logSpy).toHaveBeenCalledWith('Status:', 500);
    expect(logSpy).toHaveBeenCalledWith('Headers:', {});

    groupSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
  });

  it('本番環境では何も出力しない', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const groupSpy = jest.spyOn(console, 'group').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    logError(new Error('test'));

    expect(groupSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    groupSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
