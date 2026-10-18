/**
 * Modalコンポーネント
 */

'use client';

import { type ReactNode, memo, useCallback, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { ARIA_LABELS } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './modal.module.scss';

/**
 * Modalコンポーネントのプロパティ
 */
export interface ModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** モーダルを閉じる時のコールバック */
  onOpenChange: (open: boolean) => void;
  /** タイトル */
  title?: string;
  /** 説明 */
  description?: string;
  /** モーダルの内容 */
  children: ReactNode;
  /** カスタムクラス名 */
  className?: string;
  /** オーバーレイクリックで閉じる */
  closeOnOverlayClick?: boolean;
  /** ESCキーで閉じる */
  closeOnEscape?: boolean;
  /** サイズ */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** 閉じるボタンを表示 */
  showCloseButton?: boolean;
}

/**
 * Modalヘッダーのプロパティ
 */
export interface ModalHeaderProps {
  /** ヘッダーの内容 */
  children: ReactNode;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Modalボディのプロパティ
 */
export interface ModalBodyProps {
  /** ボディの内容 */
  children: ReactNode;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Modalフッターのプロパティ
 */
export interface ModalFooterProps {
  /** フッターの内容 */
  children: ReactNode;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Modalコンポーネント
 *
 * @example
 * ```tsx
 * <Modal
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="確認"
 *   description="この操作を実行しますか？"
 * >
 *   <ModalBody>
 *     <p>コンテンツ</p>
 *   </ModalBody>
 *   <ModalFooter>
 *     <Button onClick={() => setIsOpen(false)}>キャンセル</Button>
 *     <Button variant="primary" onClick={handleConfirm}>実行</Button>
 *   </ModalFooter>
 * </Modal>
 * ```
 */
export const Modal = memo<ModalProps>(function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  size = 'md',
  showCloseButton = true,
}) {
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  // 開く直前にフォーカスされていた要素を覚えておき、閉じたときにそこへ戻す。
  // open を外から制御しており Dialog.Trigger を使わないため、Radix の
  // 自動復帰が効かずフォーカスが body に落ちていた（WCAG 2.4.3）。
  //
  // 「閉じている間だけ focusin を監視する」ことで、ダイアログを開いた直後に
  // 中へ移ったフォーカスを誤って記録しないようにしている。
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      return;
    }

    const handleFocusIn = () => {
      if (document.activeElement instanceof HTMLElement) {
        previouslyFocusedRef.current = document.activeElement;
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [open]);

  const handleCloseAutoFocus = useCallback((event: Event) => {
    const previous = previouslyFocusedRef.current;

    // 覚えた要素がDOMから消えている場合（一覧の再描画など）は
    // Radix の既定動作に任せる
    if (!previous || !previous.isConnected) {
      return;
    }

    event.preventDefault();
    previous.focus();
  }, []);

  const contentClassNames = cn(
    styles.c_modal__content,
    styles[`c_modal__content__${size}`],
    className,
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.c_modal__overlay} />
        <Dialog.Content
          className={contentClassNames}
          onCloseAutoFocus={handleCloseAutoFocus}
          onPointerDownOutside={(e) => {
            if (!closeOnOverlayClick) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (!closeOnEscape) {
              e.preventDefault();
            }
          }}
        >
          {(title || description || showCloseButton) && (
            <div className={styles.c_modal__header}>
              <div className={styles.c_modal__header_content}>
                {title && (
                  <Dialog.Title className={styles.c_modal__title}>
                    {title}
                  </Dialog.Title>
                )}
                {description && (
                  <Dialog.Description className={styles.c_modal__description}>
                    {description}
                  </Dialog.Description>
                )}
              </div>
              {showCloseButton && (
                <Dialog.Close className={styles.c_modal__close}>
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
                  <span className='sr-only'>{ARIA_LABELS.CLOSE}</span>
                </Dialog.Close>
              )}
            </div>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

Modal.displayName = 'Modal';

/**
 * Modalヘッダーコンポーネント
 *
 * @example
 * ```tsx
 * <ModalHeader>
 *   <h2>カスタムヘッダー</h2>
 * </ModalHeader>
 * ```
 */
export const ModalHeader = memo<ModalHeaderProps>(function ModalHeader({
  children,
  className,
}) {
  const classNames = cn(styles.c_modal__header, className);

  return <div className={classNames}>{children}</div>;
});

ModalHeader.displayName = 'ModalHeader';

/**
 * Modalボディコンポーネント
 *
 * @example
 * ```tsx
 * <ModalBody>
 *   <p>コンテンツ</p>
 * </ModalBody>
 * ```
 */
export const ModalBody = memo<ModalBodyProps>(function ModalBody({
  children,
  className,
}) {
  const classNames = cn(styles.c_modal__body, className);

  return <div className={classNames}>{children}</div>;
});

ModalBody.displayName = 'ModalBody';

/**
 * Modalフッターコンポーネント
 *
 * @example
 * ```tsx
 * <ModalFooter>
 *   <Button>キャンセル</Button>
 *   <Button variant="primary">実行</Button>
 * </ModalFooter>
 * ```
 */
export const ModalFooter = memo<ModalFooterProps>(function ModalFooter({
  children,
  className,
}) {
  const classNames = cn(styles.c_modal__footer, className);

  return <div className={classNames}>{children}</div>;
});

ModalFooter.displayName = 'ModalFooter';
