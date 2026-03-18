/**
 * ユーザー関連ユーティリティ
 */

/**
 * ユーザー名からイニシャル（先頭1文字の大文字）を取得
 */
export function getInitial(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase();
}
