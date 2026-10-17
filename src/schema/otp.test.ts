import { otpSendSchema, otpVerifySchema, otpFormSchema } from './otp';

describe('otpSendSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = otpSendSchema.safeParse({
      email: 'test@example.com',
      action: 'login',
    });
    expect(result.success).toBe(true);
  });

  it('メールアドレスを小文字に正規化する', () => {
    const result = otpSendSchema.safeParse({
      email: 'TeSt@ExAmPle.COM',
      action: 'login',
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
      const result = otpSendSchema.safeParse({ email, action: 'login' });
      return result.success ? result.data.email : null;
    });
    expect(new Set(parsed)).toEqual(new Set(['a@b.com']));
  });

  it('メールアドレスの形式が不正な場合エラーになる', () => {
    const result = otpSendSchema.safeParse({
      email: 'invalid-email',
      action: 'login',
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
      action: 'login',
    });
    expect(result.success).toBe(true);
  });

  it('メールアドレスを小文字に正規化する', () => {
    const result = otpVerifySchema.safeParse({
      email: 'TeSt@ExAmPle.COM',
      code: '123456',
      action: 'login',
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
        action: 'login',
      }).success,
    ).toBe(false);
  });

  it('コードに数字以外が含まれる場合エラーになる', () => {
    expect(
      otpVerifySchema.safeParse({
        email: 'test@example.com',
        code: '12345a',
        action: 'login',
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
