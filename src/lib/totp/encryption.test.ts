import { randomBytes } from 'crypto';

import { decryptTotpSecret, encryptTotpSecret } from './encryption';
import { generateTotpSecret } from './secret';

const TEST_KEY = randomBytes(32).toString('base64');

describe('encryptTotpSecret / decryptTotpSecret', () => {
  const originalKey = process.env.TOTP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOTP_ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    process.env.TOTP_ENCRYPTION_KEY = originalKey;
  });

  it('暗号化して復号すると元の値に戻る', () => {
    const secret = generateTotpSecret();

    expect(decryptTotpSecret(encryptTotpSecret(secret))).toBe(secret);
  });

  it('暗号文に平文が現れない', () => {
    const secret = generateTotpSecret();

    expect(encryptTotpSecret(secret)).not.toContain(secret);
  });

  it('同じ平文でも毎回異なる暗号文になる', () => {
    // IV を使い回すと GCM では平文が復元され得る
    const secret = generateTotpSecret();

    expect(encryptTotpSecret(secret)).not.toBe(encryptTotpSecret(secret));
  });

  it('別の鍵では復号できない', () => {
    const ciphertext = encryptTotpSecret(generateTotpSecret());
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('base64');

    expect(() => decryptTotpSecret(ciphertext)).toThrow();
  });

  it('暗号文を改ざんすると復号に失敗する', () => {
    const [iv, authTag, encrypted] =
      encryptTotpSecret(generateTotpSecret()).split(':');

    // 認証タグがあるため、暗号文だけ差し替えても通らない
    const tampered = Buffer.from(encrypted, 'base64');
    tampered[0] ^= 0xff;

    expect(() =>
      decryptTotpSecret([iv, authTag, tampered.toString('base64')].join(':')),
    ).toThrow();
  });

  it('認証タグを改ざんすると復号に失敗する', () => {
    const [iv, authTag, encrypted] =
      encryptTotpSecret(generateTotpSecret()).split(':');

    const tampered = Buffer.from(authTag, 'base64');
    tampered[0] ^= 0xff;

    expect(() =>
      decryptTotpSecret([iv, tampered.toString('base64'), encrypted].join(':')),
    ).toThrow();
  });

  it.each([
    ['区切りが足りない', 'aaa:bbb'],
    ['区切りが多い', 'aaa:bbb:ccc:ddd'],
    ['空文字', ''],
    [
      'IV の長さが不正',
      `${Buffer.alloc(8).toString('base64')}:${Buffer.alloc(16).toString('base64')}:AAAA`,
    ],
    [
      '認証タグの長さが不正',
      `${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(8).toString('base64')}:AAAA`,
    ],
  ])('形式が不正な暗号文を拒否する: %s', (_label, ciphertext) => {
    expect(() => decryptTotpSecret(ciphertext)).toThrow(
      'Invalid encrypted TOTP secret format',
    );
  });

  it('暗号鍵が未設定なら明確なエラーになる', () => {
    delete process.env.TOTP_ENCRYPTION_KEY;

    expect(() => encryptTotpSecret('ABCDEF')).toThrow(
      'Required environment variable "TOTP_ENCRYPTION_KEY" is not set',
    );
  });

  it('暗号鍵の長さが不正なら明確なエラーになる', () => {
    // 設定ミスを「復号できない」ではなく設定時点の誤りとして気づけるようにする
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(16).toString('base64');

    expect(() => encryptTotpSecret('ABCDEF')).toThrow(
      'TOTP_ENCRYPTION_KEY must be 32 bytes when base64-decoded',
    );
  });
});
