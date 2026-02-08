import { registerSchema, registerApiSchema } from './auth';

describe('registerSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1',
      confirmPassword: 'Password1',
      name: 'テスト',
    });
    expect(result.success).toBe(true);
  });

  it('名前なしでもパースが成功する', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1',
      confirmPassword: 'Password1',
      name: '',
    });
    expect(result.success).toBe(true);
  });

  it('メールアドレスが空の場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: '',
      password: 'Password1',
      confirmPassword: 'Password1',
    });
    expect(result.success).toBe(false);
  });

  it('メールアドレスの形式が不正な場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'invalid-email',
      password: 'Password1',
      confirmPassword: 'Password1',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードが8文字未満の場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Pass1',
      confirmPassword: 'Pass1',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードに大文字がない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password1',
      confirmPassword: 'password1',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードに小文字がない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'PASSWORD1',
      confirmPassword: 'PASSWORD1',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードに数字がない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password',
      confirmPassword: 'Password',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードが一致しない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1',
      confirmPassword: 'Password2',
    });
    expect(result.success).toBe(false);
  });
});

describe('registerApiSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = registerApiSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1',
      name: 'テスト',
    });
    expect(result.success).toBe(true);
  });

  it('confirmPasswordフィールドがなくても成功する', () => {
    const result = registerApiSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1',
    });
    expect(result.success).toBe(true);
  });
});
