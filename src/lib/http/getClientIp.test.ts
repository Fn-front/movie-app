/**
 * @jest-environment node
 */

/**
 * クライアントIP取得のテスト
 *
 * レート制限の識別子に使うため、**クライアントが詐称できないこと**が要件（#647）。
 */

import { getClientIp } from './getClientIp';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers });
}

describe('getClientIp', () => {
  describe('x-vercel-forwarded-for（Vercelが付与／改変不可）', () => {
    it('存在する場合はそれを採用する', () => {
      expect(
        getClientIp(makeRequest({ 'x-vercel-forwarded-for': '203.0.113.1' })),
      ).toBe('203.0.113.1');
    });

    it('x-forwarded-for より優先する', () => {
      expect(
        getClientIp(
          makeRequest({
            // クライアントが詐称した値
            'x-forwarded-for': '1.1.1.1',
            // Vercel が設定した値
            'x-vercel-forwarded-for': '203.0.113.1',
          }),
        ),
      ).toBe('203.0.113.1');
    });

    it('カンマ区切りの場合は先頭を採用する', () => {
      expect(
        getClientIp(
          makeRequest({
            'x-vercel-forwarded-for': '203.0.113.1, 198.51.100.2',
          }),
        ),
      ).toBe('203.0.113.1');
    });
  });

  describe('x-forwarded-for のフォールバック（末尾から信頼段数ぶん遡る）', () => {
    it('単一IPの場合はそれを返す', () => {
      expect(
        getClientIp(makeRequest({ 'x-forwarded-for': '203.0.113.1' })),
      ).toBe('203.0.113.1');
    });

    it('クライアントが先頭に偽IPを詰めても、その値を返さない', () => {
      // クライアントが `1.1.1.1` を名乗り、プロキシが実IPを追記した状態
      expect(
        getClientIp(makeRequest({ 'x-forwarded-for': '1.1.1.1, 203.0.113.1' })),
      ).toBe('203.0.113.1');
    });

    it('詐称値を複数詰めても末尾側を返す', () => {
      expect(
        getClientIp(
          makeRequest({
            'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.1',
          }),
        ),
      ).toBe('203.0.113.1');
    });

    it('前後の空白を trim する', () => {
      expect(
        getClientIp(
          makeRequest({ 'x-forwarded-for': '  1.1.1.1  ,  203.0.113.1  ' }),
        ),
      ).toBe('203.0.113.1');
    });
  });

  describe('IP形式の検証', () => {
    it('IP形式でない値は無視する', () => {
      expect(
        getClientIp(
          makeRequest({ 'x-forwarded-for': 'not-an-ip, 203.0.113.1' }),
        ),
      ).toBe('203.0.113.1');
    });

    it('IP形式の値が1つも無ければ "unknown" を返す', () => {
      expect(
        getClientIp(makeRequest({ 'x-forwarded-for': 'garbage, <script>' })),
      ).toBe('unknown');
    });

    it('範囲外のオクテットを持つ値は無視する', () => {
      expect(
        getClientIp(
          makeRequest({ 'x-forwarded-for': '999.999.999.999, 203.0.113.1' }),
        ),
      ).toBe('203.0.113.1');
    });

    it('IPv6 を受け付ける', () => {
      expect(
        getClientIp(makeRequest({ 'x-vercel-forwarded-for': '2001:db8::1' })),
      ).toBe('2001:db8::1');
    });

    it('IPv4射影IPv6 を受け付ける', () => {
      expect(
        getClientIp(
          makeRequest({ 'x-vercel-forwarded-for': '::ffff:203.0.113.1' }),
        ),
      ).toBe('::ffff:203.0.113.1');
    });
  });

  describe('ヘッダ欠落', () => {
    it('どちらのヘッダも無い場合は "unknown" を返す', () => {
      expect(getClientIp(makeRequest())).toBe('unknown');
    });

    it('空文字列の場合は "unknown" を返す', () => {
      // Request コンストラクタは空 header 値を落とすため、明示的に headers を組む
      const headers = new Headers();
      headers.set('x-forwarded-for', '');
      const request = new Request('http://localhost/api/test', { headers });

      expect(getClientIp(request)).toBe('unknown');
    });
  });
});
