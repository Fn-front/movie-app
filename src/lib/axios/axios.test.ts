/**
 * Axiosインスタンス テスト
 */

// --- Mocks ---

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}));

const mockConfirmSignedOut = jest.fn();
jest.mock('@/lib/auth/sessionProbe', () => ({
  confirmSignedOut: () => mockConfirmSignedOut(),
}));

// --- Tests ---

import axios, { AxiosError, AxiosHeaders } from 'axios';
import { signOut } from 'next-auth/react';

import { axiosInstance, __resetSignOutGuardForTest } from './axios';
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
    __resetSignOutGuardForTest();
    // 既定は「ログアウト済みだとサーバーが明示した」
    mockConfirmSignedOut.mockResolvedValue(true);
  });

  /** 確認の Promise が解決するまで待つ */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** 401 を返す AxiosError を作る */
  const unauthorizedError = () => {
    const headers = new AxiosHeaders();
    return new AxiosError(
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
  };

  /**
   * ⚠️ 401 は「未認証」とは限らない（#1151）
   *
   * DB の読み取り失敗を 401 で返すルートがある（`auth/otp/send` など）。
   * 確認せずにログアウトすると、サーバーセッションの破棄と Cookie 同意
   * レコードの削除が走る。#1136 で `sessionExpiryHandler` だけ直していた
   */
  it('セッションの不在を確認できなければ signOut しない', async () => {
    mockConfirmSignedOut.mockResolvedValue(false);

    const error = unauthorizedError();
    await expect(resHandlers[0].rejected!(error)).rejects.toEqual(error);
    await flush();

    expect(mockConfirmSignedOut).toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('401が並列で複数返っても signOut は1回だけ', async () => {
    // 画面の初期化で複数のリクエストが同時に飛ぶため、抑止しないと
    // その回数だけ signOut が走る
    const errors = [unauthorizedError(), unauthorizedError()];

    await Promise.all(
      errors.map((error) =>
        expect(resHandlers[0].rejected!(error)).rejects.toEqual(error),
      ),
    );
    await flush();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    // 抑止の本体は「2回目は確認すら飛ばす」こと。signOut の回数だけ見ると、
    // 確認を2回走らせてから1回に絞る実装でも通ってしまう
    expect(mockConfirmSignedOut).toHaveBeenCalledTimes(1);
  });

  /**
   * 抑止フラグは必ず戻せること
   *
   * `logout()` は遷移が始まらなかったとき rethrow する
   * （`src/lib/auth/logout.ts`）。`void logout()` はそれを握り潰すので、
   * フラグを戻す責任はこちら側にある。戻さないと、**同意レコードは消えた・
   * ログイン状態は残る・以降どれだけ 401 が来てもログアウト経路が死んでいる**
   * という状態でSPAが続く
   */
  it('ログアウトに失敗したら、次の401でもう一度試みる', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('csrf fetch failed'));

    const first = unauthorizedError();
    await expect(resHandlers[0].rejected!(first)).rejects.toEqual(first);
    await flush();
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    const second = unauthorizedError();
    await expect(resHandlers[0].rejected!(second)).rejects.toEqual(second);
    await flush();

    expect(mockSignOut).toHaveBeenCalledTimes(2);
  });

  it('確認そのものが失敗したら、次の401で判定し直す', async () => {
    // 現在の confirmSignedOut は内部で握り潰すので実際には reject しないが、
    // フラグの寿命を確認側の実装に依存させない
    mockConfirmSignedOut.mockRejectedValueOnce(new Error('network down'));

    const first = unauthorizedError();
    await expect(resHandlers[0].rejected!(first)).rejects.toEqual(first);
    await flush();
    expect(mockSignOut).not.toHaveBeenCalled();

    const second = unauthorizedError();
    await expect(resHandlers[0].rejected!(second)).rejects.toEqual(second);
    await flush();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
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
    await flush();

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
