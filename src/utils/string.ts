/**
 * 文字列操作ユーティリティ
 */

/**
 * 文字列を指定文字数で切り詰め、省略記号を追加
 *
 * @param text - 切り詰める文字列
 * @param length - 最大文字数
 * @param ellipsis - 省略記号（デフォルト: '...'）
 * @returns 切り詰められた文字列、またはnull
 *
 * @example
 * ```ts
 * truncate('これは長いテキストです', 10);
 * // => 'これは長いテキス...'
 *
 * truncate('Short', 10);
 * // => 'Short'
 * ```
 */
export function truncate(
  text: string | null | undefined,
  length: number,
  ellipsis: string = '...',
): string | null {
  if (!text) return null;

  if (text.length <= length) {
    return text;
  }

  return text.slice(0, length) + ellipsis;
}

/**
 * 文字列の最初の文字を大文字に変換
 *
 * @param text - 変換する文字列
 * @returns 最初の文字が大文字の文字列、またはnull
 *
 * @example
 * ```ts
 * capitalize('hello world');
 * // => 'Hello world'
 *
 * capitalize('HELLO');
 * // => 'HELLO'
 * ```
 */
export function capitalize(text: string | null | undefined): string | null {
  if (!text) return null;

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * 文字列の各単語の最初の文字を大文字に変換（タイトルケース）
 *
 * @param text - 変換する文字列
 * @returns タイトルケースの文字列、またはnull
 *
 * @example
 * ```ts
 * toTitleCase('hello world');
 * // => 'Hello World'
 *
 * toTitleCase('the quick brown fox');
 * // => 'The Quick Brown Fox'
 * ```
 */
export function toTitleCase(text: string | null | undefined): string | null {
  if (!text) return null;

  return text
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * 文字列からHTMLタグを除去
 *
 * @param text - HTMLタグを含む文字列
 * @returns HTMLタグを除去した文字列、またはnull
 *
 * @example
 * ```ts
 * stripHtml('<p>Hello <strong>World</strong></p>');
 * // => 'Hello World'
 * ```
 */
export function stripHtml(text: string | null | undefined): string | null {
  if (!text) return null;

  return text.replace(/<[^>]*>/g, '');
}

/**
 * 文字列をケバブケース（kebab-case）に変換
 *
 * @param text - 変換する文字列
 * @returns ケバブケースの文字列、またはnull
 *
 * @example
 * ```ts
 * toKebabCase('Hello World');
 * // => 'hello-world'
 *
 * toKebabCase('userName');
 * // => 'user-name'
 * ```
 */
export function toKebabCase(text: string | null | undefined): string | null {
  if (!text) return null;

  return text
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase対応
    .replace(/[\s_]+/g, '-') // スペースとアンダースコアをハイフンに
    .toLowerCase();
}

/**
 * 文字列をキャメルケース（camelCase）に変換
 *
 * @param text - 変換する文字列
 * @returns キャメルケースの文字列、またはnull
 *
 * @example
 * ```ts
 * toCamelCase('hello-world');
 * // => 'helloWorld'
 *
 * toCamelCase('user_name');
 * // => 'userName'
 * ```
 */
export function toCamelCase(text: string | null | undefined): string | null {
  if (!text) return null;

  return text
    .toLowerCase()
    .replace(/[-_\s](.)/g, (_, char) => char.toUpperCase());
}

/**
 * 文字列をスネークケース（snake_case）に変換
 *
 * @param text - 変換する文字列
 * @returns スネークケースの文字列、またはnull
 *
 * @example
 * ```ts
 * toSnakeCase('Hello World');
 * // => 'hello_world'
 *
 * toSnakeCase('userName');
 * // => 'user_name'
 * ```
 */
export function toSnakeCase(text: string | null | undefined): string | null {
  if (!text) return null;

  return text
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase対応
    .replace(/[\s-]+/g, '_') // スペースとハイフンをアンダースコアに
    .toLowerCase();
}

/**
 * 文字列から余分な空白を除去
 *
 * @param text - 処理する文字列
 * @returns 空白を除去した文字列、またはnull
 *
 * @example
 * ```ts
 * normalizeWhitespace('  Hello   World  ');
 * // => 'Hello World'
 * ```
 */
export function normalizeWhitespace(
  text: string | null | undefined,
): string | null {
  if (!text) return null;

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * ランダムな文字列を生成
 *
 * @param length - 生成する文字列の長さ
 * @returns ランダムな文字列
 *
 * @example
 * ```ts
 * generateRandomString(10);
 * // => 'aB3xY9kL2m'
 * ```
 */
export function generateRandomString(length: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * 文字列が特定のパターンにマッチするか判定
 *
 * @param text - 検証する文字列
 * @param pattern - 正規表現パターン
 * @returns マッチする場合true
 *
 * @example
 * ```ts
 * matches('hello123', /^[a-z]+\d+$/);
 * // => true
 * ```
 */
export function matches(
  text: string | null | undefined,
  pattern: RegExp,
): boolean {
  if (!text) return false;

  return pattern.test(text);
}
