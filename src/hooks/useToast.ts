/**
 * トースト通知管理フック
 */

'use client';

import { useCallback } from 'react';

import { ANIMATION } from '@/constants';
import { createStore } from '@/lib/store';
import type { ToastVariant } from '@/components/ui/toast';

/**
 * トースト通知データ
 */
export interface ToastData {
  /** 一意のID */
  id: string;
  /** タイトル */
  title?: string;
  /** 説明 */
  description?: string;
  /** バリアント */
  variant: ToastVariant;
  /** 表示時間（ミリ秒） */
  duration: number;
}

/**
 * トースト追加時のオプション
 */
export interface ToastOptions {
  /** タイトル */
  title?: string;
  /** 説明 */
  description?: string;
  /** バリアント（デフォルト: info） */
  variant?: ToastVariant;
  /** 表示時間（ミリ秒、デフォルト: 5000） */
  duration?: number;
}

/**
 * トーストストアの状態
 */
interface ToastStoreState {
  /** トースト一覧 */
  toasts: ToastData[];
  /** トーストを追加 */
  addToast: (options: ToastOptions) => void;
  /** トーストを削除 */
  removeToast: (id: string) => void;
  /** すべてのトーストを削除 */
  clearToasts: () => void;
}

/** トーストIDカウンター */
let toastIdCounter = 0;

/**
 * トースト通知のグローバルストア
 */
const useToastStore = createStore<ToastStoreState>('toast', (set) => ({
  toasts: [],
  addToast: (options) => {
    const id = String(++toastIdCounter);
    const toast: ToastData = {
      id,
      title: options.title,
      description: options.description,
      variant: options.variant ?? 'info',
      duration: options.duration ?? ANIMATION.TOAST_DURATION,
    };

    set(
      (state) => ({ toasts: [...state.toasts, toast] }),
      undefined,
      'toast/add',
    );
  },
  removeToast: (id) => {
    set(
      (state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }),
      undefined,
      'toast/remove',
    );
  },
  clearToasts: () => {
    set({ toasts: [] }, undefined, 'toast/clear');
  },
}));

/**
 * トースト通知を管理するフック
 *
 * @returns トースト一覧と操作関数
 *
 * @example
 * ```tsx
 * const { toasts, toast, removeToast } = useToast();
 *
 * // トーストを表示
 * toast({ title: '保存しました', variant: 'success' });
 *
 * // エラー表示
 * toast({ title: 'エラー', description: '保存に失敗しました', variant: 'error' });
 * ```
 */
export const useToast = () => {
  const toasts = useToastStore((state) => state.toasts);
  const addToast = useToastStore((state) => state.addToast);
  const removeToast = useToastStore((state) => state.removeToast);
  const clearToasts = useToastStore((state) => state.clearToasts);

  const toast = useCallback(
    (options: ToastOptions) => {
      addToast(options);
    },
    [addToast],
  );

  return {
    toasts,
    toast,
    removeToast,
    clearToasts,
  } as const;
};
