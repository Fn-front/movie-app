/**
 * @jest-environment node
 */

import { getClientIp } from './getClientIp';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers });
}

describe('getClientIp', () => {
  it('x-forwarded-for が無い場合は "unknown" を返す', () => {
    expect(getClientIp(makeRequest())).toBe('unknown');
  });

  it('x-forwarded-for 単一 IP をそのまま返す', () => {
    expect(getClientIp(makeRequest({ 'x-forwarded-for': '203.0.113.1' }))).toBe(
      '203.0.113.1',
    );
  });

  it('x-forwarded-for がカンマ区切りの場合、先頭 IP を返す（クライアント側）', () => {
    expect(
      getClientIp(
        makeRequest({
          'x-forwarded-for': '203.0.113.1, 198.51.100.2, 10.0.0.1',
        }),
      ),
    ).toBe('203.0.113.1');
  });

  it('境界値: 先頭 IP の前後の空白を trim する', () => {
    expect(
      getClientIp(
        makeRequest({ 'x-forwarded-for': '  203.0.113.1  , 10.0.0.1' }),
      ),
    ).toBe('203.0.113.1');
  });

  it('境界値: x-forwarded-for が空文字列なら "unknown" を返す', () => {
    // Request コンストラクタは空 header 値を落とすため、明示的に headers を組む
    const headers = new Headers();
    headers.set('x-forwarded-for', '');
    const request = new Request('http://localhost/api/test', { headers });
    expect(getClientIp(request)).toBe('unknown');
  });
});
