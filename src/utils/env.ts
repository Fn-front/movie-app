/**
 * 環境変数ユーティリティ
 */

/**
 * 必須の環境変数を取得する。未設定または空文字の場合は明確なエラーを投げる。
 *
 * 設定漏れを早期に検知するため、フォールバック値は用意しない。
 *
 * @param name - 取得する環境変数名
 * @returns 環境変数の値
 * @throws 未設定または空文字の場合
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Required environment variable "${name}" is not set`);
  }

  return value;
}
