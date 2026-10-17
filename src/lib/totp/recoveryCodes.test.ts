import { randomBytes } from 'crypto';

import { RECOVERY_CODE_CONFIG } from '@/constants/totp';

import {
  findMatchingRecoveryCodeHash,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './recoveryCodes';

const TEST_KEY = randomBytes(32).toString('base64');
const originalKey = process.env.TOTP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = originalKey;
});

describe('generateRecoveryCodes', () => {
  it('設定どおりの個数を発行する', () => {
    const { codes, hashes } = generateRecoveryCodes();

    expect(codes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
    expect(hashes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
  });

  it('読み違えやすい文字を含まない', () => {
    const { codes } = generateRecoveryCodes();

    // 0/O、1/I/L、U/V を除いた字種のみ
    codes.forEach((code) => {
      expect(code).toMatch(/^[2-9A-HJKMNP-TWXYZ]{5}-[2-9A-HJKMNP-TWXYZ]{5}$/);
    });
  });

  it('同じコードを重複して発行しない', () => {
    const { codes } = generateRecoveryCodes();

    expect(new Set(codes).size).toBe(RECOVERY_CODE_CONFIG.COUNT);
  });

  it('呼ぶたびに異なるコード一式を返す', () => {
    expect(generateRecoveryCodes().codes).not.toEqual(
      generateRecoveryCodes().codes,
    );
  });

  it('ハッシュに平文が現れない', () => {
    const { codes, hashes } = generateRecoveryCodes();

    hashes.forEach((hash, index) => {
      expect(hash).not.toContain(normalizeRecoveryCode(codes[index]));
    });
  });

  it('平文とハッシュの順序が対応している', () => {
    // 順序がずれると「正しいコードが通らない」事故になる
    const { codes, hashes } = generateRecoveryCodes();

    codes.forEach((code, index) => {
      expect(hashRecoveryCode(code)).toBe(hashes[index]);
    });
  });
});

describe('hashRecoveryCode', () => {
  it('同じコードからは同じハッシュを得る', () => {
    expect(hashRecoveryCode('ABCDE-FGHJK')).toBe(
      hashRecoveryCode('ABCDE-FGHJK'),
    );
  });

  it('鍵が違えば別のハッシュになる', () => {
    // DB だけが漏れてもオフライン総当たりが成立しないことの根拠
    const withFirstKey = hashRecoveryCode('ABCDE-FGHJK');
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('base64');

    expect(hashRecoveryCode('ABCDE-FGHJK')).not.toBe(withFirstKey);
  });

  it('鍵が未設定なら明確なエラーになる', () => {
    delete process.env.TOTP_ENCRYPTION_KEY;

    expect(() => hashRecoveryCode('ABCDE-FGHJK')).toThrow(
      'Required environment variable "TOTP_ENCRYPTION_KEY" is not set',
    );
  });

  it('共有鍵の暗号化とは別の鍵を使う', async () => {
    // 用途ごとに鍵を分けていることの確認（HKDF の info が効いている）
    const { deriveTotpKey, KEY_PURPOSE } = await import('./keys');

    expect(deriveTotpKey(KEY_PURPOSE.RECOVERY_CODE_HMAC)).not.toEqual(
      deriveTotpKey(KEY_PURPOSE.SECRET_ENCRYPTION),
    );
  });
});

describe('normalizeRecoveryCode', () => {
  it.each([
    ['小文字', 'abcde-fghjk', 'ABCDEFGHJK'],
    ['ハイフンあり', 'ABCDE-FGHJK', 'ABCDEFGHJK'],
    ['ハイフンなし', 'ABCDEFGHJK', 'ABCDEFGHJK'],
    ['前後の空白', '  ABCDE-FGHJK  ', 'ABCDEFGHJK'],
    ['途中の空白', 'ABCDE FGHJK', 'ABCDEFGHJK'],
  ])('入力の揺れを吸収する: %s', (_label, input, expected) => {
    expect(normalizeRecoveryCode(input)).toBe(expected);
  });
});

describe('findMatchingRecoveryCodeHash', () => {
  it('一致したハッシュを返す', () => {
    const { codes, hashes } = generateRecoveryCodes();

    expect(findMatchingRecoveryCodeHash(codes[3], hashes)).toBe(hashes[3]);
  });

  it.each([
    ['小文字', (code: string) => code.toLowerCase()],
    ['ハイフンなし', (code: string) => code.replace('-', '')],
    ['前後に空白', (code: string) => `  ${code} `],
  ])('表示形式の揺れがあっても一致する: %s', (_label, transform) => {
    const { codes, hashes } = generateRecoveryCodes();

    expect(findMatchingRecoveryCodeHash(transform(codes[0]), hashes)).toBe(
      hashes[0],
    );
  });

  it('一致しなければ null を返す', () => {
    const { hashes } = generateRecoveryCodes();

    expect(findMatchingRecoveryCodeHash('ZZZZZ-ZZZZZ', hashes)).toBeNull();
  });

  it('別の一式のコードは一致しない', () => {
    const first = generateRecoveryCodes();
    const second = generateRecoveryCodes();

    expect(
      findMatchingRecoveryCodeHash(first.codes[0], second.hashes),
    ).toBeNull();
  });

  it('保存済みハッシュが0件なら null を返す', () => {
    // 全て使い切った状態
    expect(findMatchingRecoveryCodeHash('ABCDE-FGHJK', [])).toBeNull();
  });

  it('空文字は一致しない', () => {
    const { hashes } = generateRecoveryCodes();

    expect(findMatchingRecoveryCodeHash('', hashes)).toBeNull();
  });

  it('長さが不正なハッシュが混ざっていても例外にならない', () => {
    // timingSafeEqual は長さが違うと throw する
    const { codes, hashes } = generateRecoveryCodes();

    expect(findMatchingRecoveryCodeHash(codes[0], ['broken', ...hashes])).toBe(
      hashes[0],
    );
  });
});
