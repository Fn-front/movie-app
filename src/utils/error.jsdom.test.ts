/**
 * @jest-environment jsdom
 */

/**
 * jsdom 環境での `error.ts` の判定（#1199）
 *
 * ⚠️ **このファイルを node 環境に寄せないこと。** `error.test.ts` は
 * 先頭に `@jest-environment node` があるため `Response` が存在し、
 * 素の `error instanceof Response` でも通ってしまう。
 *
 * 実際には **jsdom に `Response` が無い**（jest-environment-jsdom 30.4.1 で実測）。
 * クライアントフックのテストは jsdom で走るので、ガードが無いと
 * 非 AxiosError を渡した時点で `ReferenceError` になる。
 */

import { AxiosError, AxiosHeaders } from 'axios';

import {
  handleApiError,
  formatErrorMessage,
  isAuthError,
  isNetworkError,
  isNotFoundError,
} from './error';

describe('jsdom 環境（Response が無い）', () => {
  it('前提: この環境に Response は存在しない', () => {
    // これが false になったら、以下のテストは意味を失う
    expect(typeof Response).toBe('undefined');
  });

  describe('非 AxiosError を渡しても例外にならない', () => {
    const notAxiosErrors: [string, unknown][] = [
      ['Error', new Error('boom')],
      ['文字列', 'boom'],
      ['null', null],
      ['undefined', undefined],
      ['プレーンオブジェクト', { status: 401 }],
    ];

    it.each(notAxiosErrors)('isAuthError: %s', (_label, error) => {
      expect(() => isAuthError(error)).not.toThrow();
      expect(isAuthError(error)).toBe(false);
    });

    it.each(notAxiosErrors)('isNetworkError: %s', (_label, error) => {
      expect(() => isNetworkError(error)).not.toThrow();
    });

    it.each(notAxiosErrors)('isNotFoundError: %s', (_label, error) => {
      expect(() => isNotFoundError(error)).not.toThrow();
      expect(isNotFoundError(error)).toBe(false);
    });

    it.each(notAxiosErrors)('handleApiError: %s', (_label, error) => {
      expect(() => handleApiError(error)).not.toThrow();
    });

    it.each(notAxiosErrors)('formatErrorMessage: %s', (_label, error) => {
      expect(() => formatErrorMessage(error)).not.toThrow();
    });
  });

  describe('AxiosError の判定は従来どおり', () => {
    const createAxiosError = (status: number) => {
      const error = new AxiosError(`Request failed with status code ${status}`);
      error.response = {
        status,
        statusText: '',
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
      return error;
    };

    it('401 は認証エラー', () => {
      expect(isAuthError(createAxiosError(401))).toBe(true);
    });

    it('404 は NotFound', () => {
      expect(isNotFoundError(createAxiosError(404))).toBe(true);
    });

    it('404 以外は NotFound ではない', () => {
      expect(isNotFoundError(createAxiosError(409))).toBe(false);
    });
  });
});
