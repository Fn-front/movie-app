import { TOTP_CONFIG, TOTP_ISSUER } from '@/constants/totp';

import { base32Decode } from './base32';
import { buildOtpAuthUri, generateTotpSecret } from './secret';
import { generateTotpCode } from './totp';

describe('generateTotpSecret', () => {
  it('base32 の文字だけで構成される', () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]+$/);
  });

  it('設定どおりのバイト長になる', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(
      TOTP_CONFIG.SECRET_BYTES,
    );
  });

  it('呼ぶたびに異なる鍵を返す', () => {
    const secrets = new Set(
      Array.from({ length: 100 }, () => generateTotpSecret()),
    );

    expect(secrets.size).toBe(100);
  });

  it('生成した鍵でコードを計算できる', () => {
    const secret = generateTotpSecret();

    expect(generateTotpCode(secret, 1_700_000_000 * 1000)).toMatch(
      new RegExp(`^\\d{${TOTP_CONFIG.DIGITS}}$`),
    );
  });
});

describe('buildOtpAuthUri', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const accountName = 'user@example.com';

  it('otpauth://totp/ で始まる', () => {
    expect(buildOtpAuthUri(secret, accountName)).toMatch(/^otpauth:\/\/totp\//);
  });

  it('発行者とアカウント名をラベルに含む', () => {
    const uri = new URL(buildOtpAuthUri(secret, accountName));

    expect(decodeURIComponent(uri.pathname)).toBe(
      `/${TOTP_ISSUER}:${accountName}`,
    );
  });

  it('仕様パラメータを明示する', () => {
    const params = new URL(buildOtpAuthUri(secret, accountName)).searchParams;

    expect(params.get('secret')).toBe(secret);
    expect(params.get('issuer')).toBe(TOTP_ISSUER);
    expect(params.get('algorithm')).toBe('SHA1');
    expect(params.get('digits')).toBe(String(TOTP_CONFIG.DIGITS));
    expect(params.get('period')).toBe(String(TOTP_CONFIG.STEP_SECONDS));
  });

  it('空白を + ではなく %20 でエンコードする', () => {
    // `+` を空白と解釈しない認証アプリがあるため
    const uri = buildOtpAuthUri(secret, accountName);

    expect(uri).toContain(encodeURIComponent(TOTP_ISSUER));
    expect(uri).not.toContain('+');
  });

  it.each([
    ['区切り文字を含むアカウント名', 'a:b@example.com'],
    ['クエリ区切りを含むアカウント名', 'a&b=c@example.com'],
    ['日本語を含むアカウント名', '利用者@example.com'],
  ])('URI を壊す文字をエスケープする: %s', (_label, name) => {
    const uri = new URL(buildOtpAuthUri(secret, name));

    // エスケープが漏れるとラベルやクエリの境界がずれる
    expect(decodeURIComponent(uri.pathname)).toBe(`/${TOTP_ISSUER}:${name}`);
    expect(uri.searchParams.get('secret')).toBe(secret);
  });
});
