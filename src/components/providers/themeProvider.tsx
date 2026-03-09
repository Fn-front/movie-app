/**
 * テーマプロバイダーコンポーネント
 * localStorageからテーマを読み込み、data-theme属性を設定する
 */

'use client';

import { memo, useEffect } from 'react';

import { STORAGE_KEYS } from '@/constants/common';

/**
 * テーマの初期化を行うコンポーネント
 * ページ読み込み時にlocalStorageからテーマを復元する
 */
export const ThemeProvider = memo(function ThemeProvider() {
  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  return null;
});

ThemeProvider.displayName = 'ThemeProvider';
