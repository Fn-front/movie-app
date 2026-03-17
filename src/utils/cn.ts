/**
 * クラス名結合ユーティリティ
 */

import clsx, { type ClassValue } from 'clsx';

/**
 * クラス名を結合する
 *
 * @example
 * ```ts
 * cn(styles.root, isActive && styles.active, className)
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
