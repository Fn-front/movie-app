/**
 * Axiosインスタンス テスト
 */

// --- Mocks ---

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}));

// --- Tests ---

import axios, { AxiosError, AxiosHeaders } from 'axios';
import { signOut } from 'next-auth/react';

import { axiosInstance } from './axios';
import { API, HTTP_STATUS, ROUTES } from '@/constants';

const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handlers = { fulfilled?: (v: any) => any; rejected?: (e: any) => any }[];
const reqHandlers = (
  axiosInstance.interceptors.request as unknown as { handlers: Handlers }
).handlers;
const resHandlers = (
  axiosInstance.interceptors.response as unknown as { handlers: Handlers }
).handlers;

describe('axiosInstance', () => {
  it('タイムアウトが正しく設定されている', () => {
    expect(axiosInstance.defaults.timeout).toBe(API.TIMEOUT);
  });

  it('Content-Typeヘッダーが正しく設定されている', () => {
    expect(axiosInstance.defaults.headers['Content-Type']).toBe(
      'application/json',
    );
  });
});

describe('リクエストインターセプター', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('開発環境でリクエストログを出力する', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'development';

    const config = {
      method: 'get',
      url: '/api/test',
      headers: new AxiosHeaders(),
    };

    const result = reqHandlers[0].fulfilled!(config);

    expect(consoleSpy).toHaveBeenCalledWith('[API Request] GET /api/test');
    expect(result).toEqual(config);

    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('本番環境ではリクエストログを出力しない', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';

    const config = {
      method: 'post',
      url: '/api/test',
      headers: new AxiosHeaders(),
    };

    reqHandlers[0].fulfilled!(config);

    expect(consoleSpy).not.toHaveBeenCalled();

    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('テスト環境ではリクエストログを出力しない', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'test';

    const config = {
      method: 'get',
      url: '/api/test',
      headers: new AxiosHeaders(),
    };

    reqHandlers[0].fulfilled!(config);

    expect(consoleSpy).not.toHaveBeenCalled();

    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('リクエストエラー時（開発環境）にエラーログを出力してrejectする', async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'development';

    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const error = new Error('Request setup failed');

    await expect(reqHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(errorSpy).toHaveBeenCalledWith('[API Request Error]', error);

    errorSpy.mockRestore();
    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('リクエストエラー時（本番環境）にはエラーログを出力せずrejectする', async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';

    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const error = new Error('Request setup failed');

    await expect(reqHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });
});

describe('レスポンスインターセプター（成功時）', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('開発環境でレスポンスログを出力する', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'development';

    const response = {
      status: 200,
      data: { result: 'ok' },
      config: {
        method: 'get',
        url: '/api/movies',
        headers: new AxiosHeaders(),
      },
      headers: {},
      statusText: 'OK',
    };

    const result = resHandlers[0].fulfilled!(response);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[API Response] GET /api/movies',
      200,
    );
    expect(result).toEqual(response);

    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('本番環境ではレスポンスログを出力しない', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';

    const response = {
      status: 200,
      data: { result: 'ok' },
      config: {
        method: 'get',
        url: '/api/movies',
        headers: new AxiosHeaders(),
      },
      headers: {},
      statusText: 'OK',
    };

    const result = resHandlers[0].fulfilled!(response);

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(result).toEqual(response);

    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });
});

describe('レスポンスインターセプター（エラー時）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401エラー時にsignOutが呼ばれる', async () => {
    const headers = new AxiosHeaders();
    const error = new AxiosError(
      'Unauthorized',
      'ERR_BAD_REQUEST',
      { headers, url: '/test', method: 'get' },
      null,
      {
        status: HTTP_STATUS.UNAUTHORIZED,
        data: {},
        statusText: 'Unauthorized',
        headers: {},
        config: { headers },
      } as unknown as import('axios').AxiosResponse,
    );

    await expect(resHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: ROUTES.LOGIN });
  });

  it('401以外のエラー時にsignOutが呼ばれない', async () => {
    const headers = new AxiosHeaders();
    const error = new AxiosError(
      'Server Error',
      'ERR_BAD_RESPONSE',
      { headers, url: '/test', method: 'get' },
      null,
      {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers },
      } as unknown as import('axios').AxiosResponse,
    );

    await expect(resHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('キャンセルされたリクエストはsignOutを呼ばない', async () => {
    const cancelError = new axios.Cancel('Request cancelled');

    jest.spyOn(axios, 'isCancel').mockReturnValueOnce(true);

    await expect(resHandlers[0].rejected!(cancelError)).rejects.toEqual(
      cancelError,
    );

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('開発環境でエラーログが出力される', async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'development';

    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const headers = new AxiosHeaders();
    const error = new AxiosError(
      'Not Found',
      'ERR_BAD_REQUEST',
      { headers, url: '/api/missing', method: 'get' },
      null,
      {
        status: HTTP_STATUS.NOT_FOUND,
        data: { message: 'Not Found' },
        statusText: 'Not Found',
        headers: {},
        config: { headers },
      } as unknown as import('axios').AxiosResponse,
    );

    await expect(resHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(errorSpy).toHaveBeenCalledWith('[API Response Error]', {
      url: '/api/missing',
      method: 'get',
      status: HTTP_STATUS.NOT_FOUND,
      message: 'Not Found',
      data: { message: 'Not Found' },
    });

    errorSpy.mockRestore();
    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('本番環境ではエラーログが出力されない', async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';

    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const headers = new AxiosHeaders();
    const error = new AxiosError(
      'Server Error',
      'ERR_BAD_RESPONSE',
      { headers, url: '/api/test', method: 'post' },
      null,
      {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers },
      } as unknown as import('axios').AxiosResponse,
    );

    await expect(resHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    (process.env as Record<string, string>).NODE_ENV = originalEnv!;
  });

  it('configがないエラーでもrejectされる', async () => {
    const error = new AxiosError(
      'Unknown Error',
      'ERR_UNKNOWN',
      undefined,
      null,
      {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: new AxiosHeaders() },
      } as unknown as import('axios').AxiosResponse,
    );

    await expect(resHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('responseがないエラーでもrejectされる', async () => {
    const headers = new AxiosHeaders();
    const error = new AxiosError(
      'Network Error',
      'ERR_NETWORK',
      { headers, url: '/test', method: 'get' },
      null,
      undefined,
    );

    await expect(resHandlers[0].rejected!(error)).rejects.toEqual(error);

    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
