/**
 * @jest-environment node
 */

/**
 * CSP 違反レポート受信 API Route テスト
 */

import { POST } from './route';

/** テスト用に Request を組み立てる。 */
function makeRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report', ...headers },
    body,
  });
}

describe('POST /api/csp-report', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('report-uri 形式（csp-report）を受信しログ出力し 204 を返す', async () => {
    const body = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://example.com/page',
        'violated-directive': "script-src 'self'",
        'effective-directive': 'script-src',
        'blocked-uri': 'https://evil.example.com/x.js',
        'source-file': 'https://example.com/page',
        'line-number': 10,
        'column-number': 5,
        disposition: 'enforce',
      },
    });

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(204);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, violation] = warnSpy.mock.calls[0];
    expect(violation).toMatchObject({
      documentUri: 'https://example.com/page',
      violatedDirective: "script-src 'self'",
      blockedUri: 'https://evil.example.com/x.js',
    });
  });

  it('Reporting API 形式（reports+json 配列）を受信しログ出力する', async () => {
    const body = JSON.stringify([
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://example.com/a',
          effectiveDirective: 'img-src',
          blockedURL: 'https://evil.example.com/pixel.png',
          disposition: 'enforce',
        },
      },
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://example.com/b',
          effectiveDirective: 'style-src',
          blockedURL: 'inline',
        },
      },
    ]);

    const res = await POST(
      makeRequest(body, { 'content-type': 'application/reports+json' }),
    );

    expect(res.status).toBe(204);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][1]).toMatchObject({
      documentUri: 'https://example.com/a',
      blockedUri: 'https://evil.example.com/pixel.png',
    });
  });

  it('Reporting API 形式で csp-violation 以外の type は無視する', async () => {
    const body = JSON.stringify([
      { type: 'deprecation', body: { message: 'x' } },
      { type: 'csp-violation', body: { blockedURL: 'https://evil/x.js' } },
    ]);

    const res = await POST(
      makeRequest(body, { 'content-type': 'application/reports+json' }),
    );

    expect(res.status).toBe(204);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('不正な JSON でも 204 を返しログしない', async () => {
    const res = await POST(makeRequest('{not-json'));

    expect(res.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('空の本文は 204 を返しログしない', async () => {
    const res = await POST(makeRequest(''));

    expect(res.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('Content-Length が上限超過の場合は本文を読まず 204 を返す', async () => {
    const res = await POST(
      makeRequest('{}', { 'content-length': String(17 * 1024) }),
    );

    expect(res.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('Content-Length が不正値（NaN）の場合は本文を読まず 204 を返す', async () => {
    const brokenRequest = {
      headers: { get: () => 'not-a-number' },
      text: jest.fn(),
    } as unknown as Request & { text: jest.Mock };

    const res = await POST(brokenRequest);

    expect(res.status).toBe(204);
    // 本文を読まずに弾くこと
    expect(
      (brokenRequest as unknown as { text: jest.Mock }).text,
    ).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('本文サイズが上限超過の場合は破棄して 204 を返す', async () => {
    // Content-Length を付けず、実本文長で上限判定させる
    const huge = JSON.stringify({
      'csp-report': { pad: 'x'.repeat(17 * 1024) },
    });
    const res = await POST(makeRequest(huge));

    expect(res.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('未知の形状（オブジェクト単体）はログせず 204 を返す', async () => {
    const res = await POST(makeRequest(JSON.stringify({ foo: 'bar' })));

    expect(res.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('本文読み取りが失敗しても 204 を返す（best-effort）', async () => {
    // text() が例外を投げる Request を模擬
    const brokenRequest = {
      headers: { get: () => '0' },
      text: () => Promise.reject(new Error('stream error')),
    } as unknown as Request;

    const res = await POST(brokenRequest);

    expect(res.status).toBe(204);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('同一IPから大量に送ると上限超過分はログせず破棄する（204維持）', async () => {
    // このテスト専用のユニークIP（他テストとレート制限状態を共有しない）
    const ip = '203.0.113.77';
    const body = JSON.stringify({
      'csp-report': { 'blocked-uri': 'https://evil.example.com/x.js' },
    });
    // 上限（route の RATE_LIMIT_MAX_REQUESTS）より十分多く送る
    const attempts = 200;

    for (let i = 0; i < attempts; i++) {
      const res = await POST(makeRequest(body, { 'x-forwarded-for': ip }));
      expect(res.status).toBe(204);
    }

    // 上限超過分は破棄されログされないため、warn 回数は試行回数より少ない
    expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
    expect(warnSpy.mock.calls.length).toBeLessThan(attempts);
  });
});
