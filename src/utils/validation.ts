/**
 * バリデーションユーティリティ
 */

/**
 * メールアドレス形式の検証
 *
 * @param email - 検証するメールアドレス
 * @returns 有効な場合true、無効な場合false
 *
 * @example
 * ```ts
 * isValidEmail('user@example.com');
 * // => true
 *
 * isValidEmail('invalid-email');
 * // => false
 * ```
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * パスワード強度の検証
 *
 * パスワードポリシー:
 * - 最低8文字以上
 * - 半角英字を含む
 * - 半角数字を含む
 *
 * @param password - 検証するパスワード
 * @returns 有効な場合true、無効な場合false
 *
 * @example
 * ```ts
 * isValidPassword('Password123');
 * // => true
 *
 * isValidPassword('pass');
 * // => false (短すぎる)
 *
 * isValidPassword('password');
 * // => false (数字なし)
 * ```
 */
export function isValidPassword(password: string | null | undefined): boolean {
  if (!password) return false;

  // 最低8文字
  if (password.length < 8) return false;

  // 半角英字を含む
  const hasLetter = /[a-zA-Z]/.test(password);
  if (!hasLetter) return false;

  // 半角数字を含む
  const hasNumber = /\d/.test(password);
  if (!hasNumber) return false;

  return true;
}

/**
 * パスワード強度をチェックして詳細を返す
 *
 * @param password - 検証するパスワード
 * @returns パスワード強度の詳細オブジェクト
 *
 * @example
 * ```ts
 * getPasswordStrength('Pass1');
 * // => { isValid: false, errors: ['最低8文字必要です'] }
 *
 * getPasswordStrength('Password123');
 * // => { isValid: true, errors: [] }
 * ```
 */
export function getPasswordStrength(password: string | null | undefined): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!password) {
    errors.push('パスワードを入力してください');
    return { isValid: false, errors };
  }

  if (password.length < 8) {
    errors.push('最低8文字必要です');
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push('半角英字を含めてください');
  }

  if (!/\d/.test(password)) {
    errors.push('半角数字を含めてください');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * URLの検証
 *
 * @param url - 検証するURL
 * @returns 有効な場合true、無効な場合false
 *
 * @example
 * ```ts
 * isValidUrl('https://example.com');
 * // => true
 *
 * isValidUrl('not-a-url');
 * // => false
 * ```
 */
export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 空文字チェック（空白のみもfalse）
 *
 * @param value - 検証する文字列
 * @returns 空でない場合true、空の場合false
 *
 * @example
 * ```ts
 * isNotEmpty('Hello');
 * // => true
 *
 * isNotEmpty('   ');
 * // => false
 *
 * isNotEmpty('');
 * // => false
 * ```
 */
export function isNotEmpty(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

/**
 * 文字列長の範囲チェック
 *
 * @param value - 検証する文字列
 * @param min - 最小文字数
 * @param max - 最大文字数（オプション）
 * @returns 範囲内の場合true、範囲外の場合false
 *
 * @example
 * ```ts
 * isLengthInRange('Hello', 3, 10);
 * // => true
 *
 * isLengthInRange('Hi', 3, 10);
 * // => false
 * ```
 */
export function isLengthInRange(
  value: string | null | undefined,
  min: number,
  max?: number,
): boolean {
  if (!value) return false;

  const length = value.length;
  const isAboveMin = length >= min;
  const isBelowMax = max === undefined || length <= max;

  return isAboveMin && isBelowMax;
}
