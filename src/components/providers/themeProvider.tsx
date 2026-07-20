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
  getSystemTheme,
  isSystemMode,
} from '@/utils/theme';

/**
 * テーマの初期化と OS 追従を行うコンポーネント
 */
export const ThemeProvider = memo(function ThemeProvider() {
  useEffect(() => {
    // 明示設定が無ければ OS 設定へ解決して適用（インラインスクリプトと二重だが無害）
    if (isSystemMode()) {
      applyTheme(getSystemTheme());
    }

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
