import { randomBytes } from 'crypto';

import { deriveTotpKey, KEY_PURPOSE } from './keys';

const TEST_KEY = randomBytes(32).toString('base64');
const originalKey = process.env.TOTP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = originalKey;
});

describe('deriveTotpKey', () => {
  it('32バイトの鍵を返す', () => {
    expect(deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION)).toHaveLength(32);
  });

  it('同じ用途・同じマスター鍵なら常に同じ鍵になる', () => {
    // ここが決定的でないと、保存済みデータを復号できなくなる
    expect(deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION)).toEqual(
      deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION),
    );
  });

  it('用途が違えば別の鍵になる', () => {
    expect(deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION)).not.toEqual(
      deriveTotpKey(KEY_PURPOSE.RECOVERY_CODE_HMAC),
    );
  });

  it('マスター鍵が違えば別の鍵になる', () => {
    const first = deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION);
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('base64');

    expect(deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION)).not.toEqual(first);
  });

  it('導出した鍵がマスター鍵そのものではない', () => {
    expect(deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION)).not.toEqual(
      Buffer.from(TEST_KEY, 'base64'),
    );
  });

  it('マスター鍵が未設定なら明確なエラーになる', () => {
    delete process.env.TOTP_ENCRYPTION_KEY;

    expect(() => deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION)).toThrow(
      'Required environment variable "TOTP_ENCRYPTION_KEY" is not set',
    );
  });

  it.each([
    ['短すぎる', 16],
    ['長すぎる', 64],
  ])('マスター鍵の長さが不正なら明確なエラーになる: %s', (_label, bytes) => {
    // 設定ミスを「復号できない」ではなく設定時点の誤りとして気づけるようにする
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(bytes).toString('base64');

    expect(() => deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION)).toThrow(
      'TOTP_ENCRYPTION_KEY must be 32 bytes when base64-decoded',
    );
  });
});
