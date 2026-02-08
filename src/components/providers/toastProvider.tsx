/**
 * Toast通知プロバイダー
 *
 * Radix UI ToastProviderとToastContainerを統合する
 */

'use client';

import { memo, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/toast/toast';
import { ToastContainer } from '@/features/toast/toastContainer/toastContainer';

interface AppToastProviderProps {
  children: ReactNode;
}

/**
 * アプリケーション全体のトースト通知プロバイダー
 *
 * root layoutで使用し、アプリ全体でトースト通知を利用可能にする
 */
export const AppToastProvider = memo(function AppToastProvider({
  children,
}: AppToastProviderProps) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
});

AppToastProvider.displayName = 'AppToastProvider';
