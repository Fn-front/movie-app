/**
 * テーマプロバイダーコンポーネント
 * - 初回マウント時に data-theme を解決適用（インラインスクリプトの保険）
 * - 未設定/system（OS追従）の場合、OS の配色変更にライブ追従する
 */

'use client';

import { memo, useEffect } from 'react';

import {
  THEME_CHANGE_EVENT,
  applyTheme,
  getStoredPreference,
  getSystemTheme,
  isSystemMode,
  resolveTheme,
} from '@/utils/theme';

/**
 * テーマの初期化と OS 追従を行うコンポーネント
 */
export const ThemeProvider = memo(function ThemeProvider() {
  useEffect(() => {
    // 明示設定の有無によらず適用する。
    // `notFound()` のページは `<html id="__next_error__">` の最小シェルで返り、
    // layout のインラインスクリプトを含まない。ここを OS 追従時だけにすると、
    // 明示設定のユーザーに data-theme が一度も付かない（#1013）。
    // 通常ページではインラインスクリプトと同じ値を入れ直すだけで無害。
    applyTheme(resolveTheme(getStoredPreference()));

    if (!window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // OS 追従中のみ、OS の配色変更に合わせて切り替える
      if (isSystemMode()) {
        applyTheme(getSystemTheme());
        window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return null;
});

ThemeProvider.displayName = 'ThemeProvider';
