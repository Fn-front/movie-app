/**
 * @jest-environment node
 */

/**
 * OTPコードのハッシュ化テスト（#640）
 */

import { hashOtpCode, verifyOtpCode } from './hashOtpCode';

const ORIGINAL_ENV = process.env;

describe('hashOtpCode', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, OTP_HASH_PEPPER: 'test-pepper-value' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('HMAC-SHA256のhex文字列（64文字）を返す', () => {
    const hash = hashOtpCode('123456', 'user@example.com');

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('平文コードをそのまま返さない', () => {
    expect(hashOtpCode('123456', 'user@example.com')).not.toContain('123456');
  });

  it('同じコード・同じメールなら同じハッシュ（検索に使えること）', () => {
    expect(hashOtpCode('123456', 'user@example.com')).toBe(
      hashOtpCode('123456', 'user@example.com'),
    );
  });

  it('メールアドレスが違えば同じコードでも異なるハッシュ（横断的な突合の防止）', () => {
    expect(hashOtpCode('123456', 'a@example.com')).not.toBe(
      hashOtpCode('123456', 'b@example.com'),
    );
  });

  it('メールアドレスの大文字小文字を正規化する', () => {
    expect(hashOtpCode('123456', 'User@Example.com')).toBe(
      hashOtpCode('123456', 'user@example.com'),
    );
  });

  it('コードが違えば異なるハッシュ', () => {
    expect(hashOtpCode('123456', 'user@example.com')).not.toBe(
      hashOtpCode('123457', 'user@example.com'),
    );
  });

  it('pepper が違えば異なるハッシュ（鍵がDBの外にあることの担保）', () => {
    const withA = hashOtpCode('123456', 'user@example.com');

    process.env.OTP_HASH_PEPPER = 'another-pepper';
    const withB = hashOtpCode('123456', 'user@example.com');

    expect(withA).not.toBe(withB);
  });

  it('OTP_HASH_PEPPER が未設定なら例外を投げる（平文へのフォールバック禁止）', () => {
    delete process.env.OTP_HASH_PEPPER;

    expect(() => hashOtpCode('123456', 'user@example.com')).toThrow(
      'Required environment variable "OTP_HASH_PEPPER" is not set',
    );
  });
});

describe('verifyOtpCode', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, OTP_HASH_PEPPER: 'test-pepper-value' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const email = 'user@example.com';

  it('正しいコードで true を返す', () => {
    const stored = hashOtpCode('123456', email);

    expect(verifyOtpCode('123456', email, stored)).toBe(true);
  });

  it('誤ったコードで false を返す', () => {
    const stored = hashOtpCode('123456', email);

    expect(verifyOtpCode('999999', email, stored)).toBe(false);
  });

  it('別のメールアドレスのハッシュでは false を返す', () => {
    const stored = hashOtpCode('123456', 'other@example.com');

    expect(verifyOtpCode('123456', email, stored)).toBe(false);
  });

  it('保存ハッシュが null なら false を返す（code_hash 未設定の旧レコード）', () => {
    expect(verifyOtpCode('123456', email, null)).toBe(false);
  });

  it('保存ハッシュが空文字なら false を返す', () => {
    expect(verifyOtpCode('123456', email, '')).toBe(false);
  });

  it('保存ハッシュの長さが不正でも例外を投げずに false を返す', () => {
    expect(verifyOtpCode('123456', email, 'deadbeef')).toBe(false);
  });

  it('保存ハッシュがhexでなくても例外を投げずに false を返す', () => {
    expect(verifyOtpCode('123456', email, 'not-hex-at-all')).toBe(false);
  });

  it('pepper が変わると既存ハッシュを検証できない（鍵の分離が効いている）', () => {
    const stored = hashOtpCode('123456', email);

    process.env.OTP_HASH_PEPPER = 'rotated-pepper';

    expect(verifyOtpCode('123456', email, stored)).toBe(false);
  });
});
