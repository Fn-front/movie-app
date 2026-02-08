/**
 * トーストコンテナコンポーネント
 *
 * useToastストアからトースト通知を取得し、Toast UIコンポーネントで表示する
 */

'use client';

import { memo, useCallback } from 'react';

import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';

/**
 * トーストコンテナ
 *
 * Zustandストアのトースト一覧を監視し、Radix UI Toastとして描画する
 */
export const ToastContainer = memo(function ToastContainer() {
  const { toasts, removeToast } = useToast();

  const handleOpenChange = useCallback(
    (id: string) => (open: boolean) => {
      if (!open) {
        removeToast(id);
      }
    },
    [removeToast],
  );

  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          open={true}
          onOpenChange={handleOpenChange(toast.id)}
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          duration={toast.duration}
        />
      ))}
    </>
  );
});

ToastContainer.displayName = 'ToastContainer';
