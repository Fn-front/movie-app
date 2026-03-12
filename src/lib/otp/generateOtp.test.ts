/**
 * OTPコード生成ユーティリティ テスト
 */

import { generateOtpCode } from './generateOtp';

describe('generateOtpCode', () => {
  it('6桁の数字文字列を返す', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(code).toHaveLength(6);
  });

  it('先頭が0でもパディングされて6桁になる', () => {
    // 複数回実行して常に6桁であることを確認
    for (let i = 0; i < 100; i++) {
      const code = generateOtpCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[0-9]{6}$/);
    }
  });

  it('異なるコードを生成する（十分な回数で重複が少ない）', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateOtpCode());
    }
    // 50回生成して少なくとも10種類以上は異なるはず
    expect(codes.size).toBeGreaterThan(10);
  });
});
