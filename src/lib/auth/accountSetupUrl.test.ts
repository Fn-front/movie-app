/**
 * @jest-environment node
 */

import { ACCOUNT_SETUP_ISSUED_PARAM } from '@/constants/adminAccount';

import { buildAccountSetupUrl } from './accountSetupUrl';

describe('buildAccountSetupUrl', () => {
  const originalBaseUrl = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://movie-app.example';
  });

  afterAll(() => {
    // ⚠️ 未設定だったときに代入で戻すと、文字列 `'undefined'` が残る。
    // CI の jest は `NEXTAUTH_URL` を渡していないので、同じ worker の
    // 後続ファイルがそれを読む
    if (originalBaseUrl === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = originalBaseUrl;
    }
  });

  it('NEXTAUTH_URL を基点に再設定ページのURLを作る', () => {
    // Host ヘッダを使わない。攻撃者が仕込んだホスト宛のリンクを
    // メールで配れてしまうため
    const url = new URL(buildAccountSetupUrl('plain-token'));

    expect(url.origin).toBe('https://movie-app.example');
    expect(url.pathname).toBe('/auth/reset-password');
  });

  it('トークンをクエリに載せる', () => {
    const url = new URL(buildAccountSetupUrl('plain-token'));

    expect(url.searchParams.get('token')).toBe('plain-token');
  });

  it('発行経由であることを示す印を付ける', () => {
    // 受け取り手は自力で再送できない（合成アドレス宛には届かない）。
    // 設定ページが案内を出し分けられるようにする
    const url = new URL(buildAccountSetupUrl('plain-token'));

    expect(url.searchParams.get(ACCOUNT_SETUP_ISSUED_PARAM.NAME)).toBe(
      ACCOUNT_SETUP_ISSUED_PARAM.VALUE,
    );
  });

  it('NEXTAUTH_URL が無ければ投げる', () => {
    // フォールバックを置くと、設定漏れのまま誤ったホストのリンクを配る
    delete process.env.NEXTAUTH_URL;

    expect(() => buildAccountSetupUrl('plain-token')).toThrow('NEXTAUTH_URL');
  });
});
