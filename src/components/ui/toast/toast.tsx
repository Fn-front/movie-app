/**
 * Toastコンポーネント
 */

'use client';

import { type ReactNode, memo, useCallback } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';

import { ARIA_LABELS } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './toast.module.scss';

/**
 * Toastのバリアント型
 */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * Toastコンポーネントのプロパティ
 */
export interface ToastProps {
  /** トーストの開閉状態 */
  open: boolean;
  /** トーストを閉じる時のコールバック */
  onOpenChange: (open: boolean) => void;
  /** タイトル */
  title?: string;
  /** 説明 */
  description?: string;
  /** バリアント */
  variant?: ToastVariant;
  /** 自動で消えるまでの時間（ミリ秒） */
  duration?: number;
  /** アクション */
  action?: ReactNode;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * ToastProviderのプロパティ
 */
export interface ToastProviderProps {
  /** 子要素 */
  children: ReactNode;
  /** スワイプの方向 */
  swipeDirection?: 'up' | 'down' | 'left' | 'right';
  /** 自動で消えるまでの時間（ミリ秒） */
  duration?: number;
}

/**
 * ToastProvider
 *
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 */
export const ToastProvider = memo<ToastProviderProps>(function ToastProvider({
  children,
  swipeDirection = 'right',
  duration = 5000,
}) {
  return (
    <ToastPrimitive.Provider
      swipeDirection={swipeDirection}
      duration={duration}
    >
      {children}
      <ToastPrimitive.Viewport className={styles.c_toast__viewport} />
    </ToastPrimitive.Provider>
  );
});

ToastProvider.displayName = 'ToastProvider';

/**
 * Toastコンポーネント
 *
 * @example
 * ```tsx
 * <Toast
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="成功"
 *   description="操作が完了しました"
 *   variant="success"
 * />
 * ```
 */
export const Toast = memo<ToastProps>(function Toast({
  open,
  onOpenChange,
  title,
  description,
  variant = 'info',
  duration = 5000,
  action,
  className,
}) {
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  const classNames = cn(
    styles.c_toast,
    styles[`c_toast__variant__${variant}`],
    className,
  );

  const getIcon = () => {
    switch (variant) {
      case 'success':
        return (
          <svg
            width='20'
            height='20'
            viewBox='0 0 20 20'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            aria-hidden='true'
          >
            <path
              d='M16.6667 5L7.50002 14.1667L3.33335 10'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        );
      case 'error':
        return (
          <svg
            width='20'
            height='20'
            viewBox='0 0 20 20'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            aria-hidden='true'
          >
            <path
              d='M15 5L5 15M5 5L15 15'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        );
      case 'warning':
        return (
          <svg
            width='20'
            height='20'
            viewBox='0 0 20 20'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            aria-hidden='true'
          >
            <path
              d='M10 6.66667V10M10 13.3333H10.0083M8.82502 3.33333L1.92502 15C1.69891 15.3894 1.58025 15.8332 1.58221 16.2852C1.58417 16.7372 1.70668 17.18 1.93601 17.5672C2.16534 17.9544 2.49294 18.2721 2.88631 18.4881C3.27968 18.7041 3.72516 18.8105 4.17502 18.7967H17.825C18.2749 18.8105 18.7204 18.7041 19.1137 18.4881C19.5071 18.2721 19.8347 17.9544 20.064 17.5672C20.2934 17.18 20.4159 16.7372 20.4178 16.2852C20.4198 15.8332 20.3011 15.3894 20.075 15L13.175 3.33333C12.9437 2.95457 12.6159 2.64449 12.2251 2.43541C11.8343 2.22634 11.3935 2.12549 10.9458 2.14335C10.4982 2.16121 10.0661 2.29707 9.69252 2.53672C9.31891 2.77637 9.01613 3.11146 8.82502 3.50833V3.33333Z'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        );
      case 'info':
        return (
          <svg
            width='20'
            height='20'
            viewBox='0 0 20 20'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            aria-hidden='true'
          >
            <path
              d='M10 13.3333V10M10 6.66667H10.0083M18.3333 10C18.3333 14.6024 14.6024 18.3333 10 18.3333C5.39763 18.3333 1.66667 14.6024 1.66667 10C1.66667 5.39763 5.39763 1.66667 10 1.66667C14.6024 1.66667 18.3333 5.39763 18.3333 10Z'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <ToastPrimitive.Root
      className={classNames}
      open={open}
      onOpenChange={handleOpenChange}
      duration={duration}
    >
      <div className={styles.c_toast__icon}>{getIcon()}</div>

      <div className={styles.c_toast__content}>
        {title && (
          <ToastPrimitive.Title className={styles.c_toast__title}>
            {title}
          </ToastPrimitive.Title>
        )}
        {description && (
          <ToastPrimitive.Description className={styles.c_toast__description}>
            {description}
          </ToastPrimitive.Description>
        )}
      </div>

      {action && <div className={styles.c_toast__action}>{action}</div>}

      <ToastPrimitive.Close className={styles.c_toast__close}>
        <svg
          width='16'
          height='16'
          viewBox='0 0 16 16'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
        >
          <path
            d='M12 4L4 12M4 4L12 12'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
        <span className='sr-only'>{ARIA_LABELS.CLOSE}</span>
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
});

Toast.displayName = 'Toast';
