import { TWO_FACTOR_OTP_ACTION } from '@/constants/secondFactor';

import {
  otpSendSchema,
  otpVerifySchema,
  otpFormSchema,
  PUBLIC_OTP_ACTIONS,
} from './otp';

describe('otpSendSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = otpSendSchema.safeParse({
      email: 'test@example.com',
      action: 'registration',
    });
    expect(result.success).toBe(true);
  });

  it('メールアドレスを小文字に正規化する', () => {
    const result = otpSendSchema.safeParse({
      email: 'TeSt@ExAmPle.COM',
      action: 'registration',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('前後の空白を落としてから検証・正規化する', () => {
    const result = otpSendSchema.safeParse({
      email: '  test@example.com  ',
      action: 'registration',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('大小文字違いの表記はすべて同じ値に収束する（送信上限を分割できない）', () => {
    const variants = ['a@b.com', 'A@B.com', 'a@B.COM', 'A@B.COM'];
    const parsed = variants.map((email) => {
      const result = otpSendSchema.safeParse({ email, action: 'registration' });
      return result.success ? result.data.email : null;
    });
    expect(new Set(parsed)).toEqual(new Set(['a@b.com']));
  });

  it('メールアドレスの形式が不正な場合エラーになる', () => {
    const result = otpSendSchema.safeParse({
      email: 'invalid-email',
      action: 'registration',
    });
    expect(result.success).toBe(false);
  });

  it('アクション種別が不正な場合エラーになる', () => {
    const result = otpSendSchema.safeParse({
      email: 'test@example.com',
      action: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});

describe('otpVerifySchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = otpVerifySchema.safeParse({
      email: 'test@example.com',
      code: '123456',
      action: 'registration',
    });
    expect(result.success).toBe(true);
  });

  it('メールアドレスを小文字に正規化する', () => {
    const result = otpVerifySchema.safeParse({
      email: 'TeSt@ExAmPle.COM',
      code: '123456',
      action: 'registration',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('コードが6桁でない場合エラーになる', () => {
    expect(
      otpVerifySchema.safeParse({
        email: 'test@example.com',
        code: '12345',
        action: 'registration',
      }).success,
    ).toBe(false);
  });

  it('コードに数字以外が含まれる場合エラーになる', () => {
    expect(
      otpVerifySchema.safeParse({
        email: 'test@example.com',
        code: '12345a',
        action: 'registration',
      }).success,
    ).toBe(false);
  });
});

describe('otpFormSchema', () => {
  it('6桁の数字でパースが成功する', () => {
    expect(otpFormSchema.safeParse({ otp: '123456' }).success).toBe(true);
  });

  it('6桁未満はエラーになる', () => {
    expect(otpFormSchema.safeParse({ otp: '123' }).success).toBe(false);
  });
});

/**
 * 公開ルートが受け付ける action を固定する
 *
 * ⚠️ これは設計の前提そのもの。以前は `Object.values(OTP_ACTION)` から
 * zod enum を導出していたため、`OTP_ACTION` に用途を足すだけで
 * `/api/auth/otp/send` と `/api/auth/otp/verify` が自動的にそれを受理した。
 *
 * 第2要素（`two_factor`）が入ると、send の action 分岐は宛先固定を
 * password_change のときしか行わないため、**未認証のまま任意のアドレスへ
 * 自サービス名義の確認コードを送れる**状態になる（#641 の穴の再発）。
 *
 * 現行実装でも通る（回帰テスト）。赤→緑にはならない。
 */
describe('公開ルートの action 許可リスト', () => {
  it('公開するのは registration / password_change の2つだけ', () => {
    expect([...PUBLIC_OTP_ACTIONS].sort()).toEqual([
      'password_change',
      'registration',
    ]);
  });

  it('otpSendSchema は two_factor を拒否する', () => {
    const result = otpSendSchema.safeParse({
      email: 'user@example.com',
      action: TWO_FACTOR_OTP_ACTION,
    });
    expect(result.success).toBe(false);
  });

  it('otpVerifySchema は two_factor を拒否する', () => {
    const result = otpVerifySchema.safeParse({
      email: 'user@example.com',
      code: '123456',
      action: TWO_FACTOR_OTP_ACTION,
    });
    expect(result.success).toBe(false);
  });
});
