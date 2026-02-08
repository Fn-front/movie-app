import {
  isValidEmail,
  isValidPassword,
  getPasswordStrength,
  isValidUrl,
  isNotEmpty,
  isLengthInRange,
} from './validation';

describe('isValidEmail', () => {
  it('有効なメールアドレスの場合trueを返す', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('不正な形式の場合falseを返す', () => {
    expect(isValidEmail('invalid-email')).toBe(false);
  });

  it('nullの場合falseを返す', () => {
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('有効なパスワード（8文字以上、英字+数字）の場合trueを返す', () => {
    expect(isValidPassword('Password1')).toBe(true);
  });

  it('短すぎるパスワードの場合falseを返す', () => {
    expect(isValidPassword('Pass1')).toBe(false);
  });

  it('数字なしのパスワードの場合falseを返す', () => {
    expect(isValidPassword('password')).toBe(false);
  });

  it('英字なしのパスワードの場合falseを返す', () => {
    expect(isValidPassword('12345678')).toBe(false);
  });

  it('nullの場合falseを返す', () => {
    expect(isValidPassword(null)).toBe(false);
  });
});

describe('getPasswordStrength', () => {
  it('有効なパスワードの場合isValid:trueとerrors:[]を返す', () => {
    const result = getPasswordStrength('Password1');
    expect(result).toEqual({ isValid: true, errors: [] });
  });

  it('nullの場合、入力要求エラーを返す', () => {
    const result = getPasswordStrength(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('パスワードを入力してください');
  });

  it('短すぎるパスワードの場合、文字数エラーを含む', () => {
    const result = getPasswordStrength('Pa1');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('最低8文字必要です');
  });

  it('英字なしの場合、英字エラーを含む', () => {
    const result = getPasswordStrength('12345678');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('半角英字を含めてください');
  });

  it('数字なしの場合、数字エラーを含む', () => {
    const result = getPasswordStrength('abcdefgh');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('半角数字を含めてください');
  });
});

describe('isValidUrl', () => {
  it('有効なURLの場合trueを返す', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('不正なURLの場合falseを返す', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('nullの場合falseを返す', () => {
    expect(isValidUrl(null)).toBe(false);
  });
});

describe('isNotEmpty', () => {
  it('文字列がある場合trueを返す', () => {
    expect(isNotEmpty('Hello')).toBe(true);
  });

  it('空白のみの場合falseを返す', () => {
    expect(isNotEmpty('   ')).toBe(false);
  });

  it('空文字の場合falseを返す', () => {
    expect(isNotEmpty('')).toBe(false);
  });

  it('nullの場合falseを返す', () => {
    expect(isNotEmpty(null)).toBe(false);
  });
});

describe('isLengthInRange', () => {
  it('範囲内の場合trueを返す', () => {
    expect(isLengthInRange('Hello', 3, 10)).toBe(true);
  });

  it('最小文字数未満の場合falseを返す', () => {
    expect(isLengthInRange('Hi', 3, 10)).toBe(false);
  });

  it('最大文字数超過の場合falseを返す', () => {
    expect(isLengthInRange('Hello World!', 3, 5)).toBe(false);
  });

  it('max省略時、min以上であればtrueを返す', () => {
    expect(isLengthInRange('Hello', 3)).toBe(true);
  });

  it('nullの場合falseを返す', () => {
    expect(isLengthInRange(null, 3, 10)).toBe(false);
  });
});
