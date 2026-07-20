/**
 * テーマ切り替えフック
 *
 * 適用中テーマ（resolvedTheme）を提供し、明示的な light/dark への切り替えを行う。
 * 切り替えは localStorage・data-theme・サーバー保存を更新し、失敗時はロールバックする。
 * 適用テーマは data-theme（外部状態）を唯一の真実源とし、useSyncExternalStore で購読する。
 * 複数インスタンス/タブ間はカスタムイベント + storage イベントで同期する。
 */

'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { useToast } from '@/hooks/useToast';
import { updateSettings } from '@/lib/api/user/user';
import { handleApiError } from '@/utils/error';
import { STORAGE_KEYS } from '@/constants/common';
import {
  THEME_CHANGE_EVENT,
  type ResolvedTheme,
  applyTheme,
  getAppliedTheme,
  getStoredPreference,
} from '@/utils/theme';

interface UseThemeReturn {
  /** 現在適用中のテーマ（system は解決済み） */
  resolvedTheme: ResolvedTheme;
  /** 明示的にテーマを設定する（localStorage/data-theme/サーバーを更新） */
  setTheme: (theme: ResolvedTheme) => void;
  /** ライト⇔ダークを反転する */
  toggleTheme: () => void;
}

/** data-theme の変更（同一タブのイベント / 別タブの storage）を購読する */
function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/** SSR 時のスナップショット（クライアントで data-theme に同期される） */
function getServerSnapshot(): ResolvedTheme {
  return 'light';
}

/**
 * テーマの取得・切り替えを行うフック
 */
export function useTheme(): UseThemeReturn {
  const { toast } = useToast();
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    getAppliedTheme,
    getServerSnapshot,
  );

  const setTheme = useCallback(
    async (theme: ResolvedTheme) => {
      const previousStored = getStoredPreference();
      const previousResolved = getAppliedTheme();

      // 楽観的更新（即時反映）。イベントで購読側（本フック含む）へ通知する
      try {
        localStorage.setItem(STORAGE_KEYS.THEME, theme);
      } catch {
        // localStorage 不可環境でも data-theme 適用は継続
      }
      applyTheme(theme);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));

      try {
        await updateSettings({ theme });
        toast({ title: 'テーマを変更しました', variant: 'success' });
      } catch (error) {
        // 失敗時は元に戻す
        try {
          if (previousStored === null) {
            localStorage.removeItem(STORAGE_KEYS.THEME);
          } else {
            localStorage.setItem(STORAGE_KEYS.THEME, previousStored);
          }
        } catch {
          // no-op
        }
        applyTheme(previousResolved);
        window.dispatchEvent(new Event(THEME_CHANGE_EVENT));

        const { message } = handleApiError(error);
        toast({
          title: '更新エラー',
          description: message ?? 'テーマの変更に失敗しました',
          variant: 'error',
        });
      }
    },
    [toast],
  );

  const toggleTheme = useCallback(() => {
    setTheme(getAppliedTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { resolvedTheme, setTheme, toggleTheme };
}
