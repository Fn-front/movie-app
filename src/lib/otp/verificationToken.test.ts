/**
 * OTP検証済みトークンのテスト
 */

import {
  generateVerificationToken,
  hashVerificationToken,
} from './verificationToken';

describe('generateVerificationToken', () => {
  it('平文トークンとそのハッシュを返す', () => {
    const { token, tokenHash } = generateVerificationToken();

    expect(token).toEqual(expect.any(String));
    expect(tokenHash).toBe(hashVerificationToken(token));
  });

  it('平文トークンをそのままハッシュとして返さない（DBに平文が残らない）', () => {
    const { token, tokenHash } = generateVerificationToken();

    expect(tokenHash).not.toBe(token);
  });

  it('256bit相当のエントロピーを持つ（base64urlで43文字）', () => {
    const { token } = generateVerificationToken();

    // 32バイトを base64url 化すると padding なしで 43 文字になる
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('呼び出しごとに異なるトークンを生成する', () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateVerificationToken().token),
    );

    expect(tokens.size).toBe(50);
  });
});

describe('hashVerificationToken', () => {
  it('SHA-256のhex文字列（64文字）を返す', () => {
    const hash = hashVerificationToken('any-token');

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('同じトークンからは同じハッシュを返す（検索に使えること）', () => {
    expect(hashVerificationToken('same-token')).toBe(
      hashVerificationToken('same-token'),
    );
  });

  it('異なるトークンからは異なるハッシュを返す', () => {
    expect(hashVerificationToken('token-a')).not.toBe(
      hashVerificationToken('token-b'),
    );
  });

  it('1文字違いでも全く異なるハッシュになる', () => {
    const a = hashVerificationToken('token-a');
    const b = hashVerificationToken('token-b');

    // 先頭8文字が一致しない（雪崩効果の簡易確認）
    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
  });
});
