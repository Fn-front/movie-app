/**
 * テーマ解決ユーティリティ
 *
 * 適用テーマ（data-theme）は「明示設定（localStorage）優先、無ければ OS の
 * prefers-color-scheme に追従」で決まる。SSR 安全（window/document 未定義でも動作）。
 */

import { STORAGE_KEYS } from '@/constants/common';

/** 実際に画面へ適用されるテーマ */
export type ResolvedTheme = 'light' | 'dark';
/** ユーザーの設定値（system=OS追従） */
export type ThemePreference = 'light' | 'dark' | 'system';

/** テーマ変更をインスタンス/タブ間で同期するためのカスタムイベント名 */
export const THEME_CHANGE_EVENT = 'movie-app:theme-change';

/** OS の配色設定を取得（SSR安全。判定不可時は light） */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** localStorage に保存された明示設定を取得（SSR安全。未設定/未知値は null） */
export function getStoredPreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.THEME);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** 設定値を実適用テーマへ解決（system/未設定は OS 追従） */
export function resolveTheme(
  preference: ThemePreference | null,
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return getSystemTheme();
}

/** 現在 <html> に適用されているテーマを取得（SSR安全） */
export function getAppliedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

/** <html data-theme> に適用する */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/** 明示設定が無く OS に追従している状態か */
export function isSystemMode(): boolean {
  const preference = getStoredPreference();
  return preference === null || preference === 'system';
}
