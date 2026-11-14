/**
 * Modalコンポーネント
 */

'use client';

import {
  type ReactNode,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { ARIA_LABELS } from '@/constants';
import { useOverlayHistory } from '@/hooks/useOverlayHistory';

/**
 * モーダルの中から「閉じると同時に URL を変える」ことを伝えるための口。
 *
 * 畳む処理は非同期なので、申告が無いと後から届く back が router の
 * 更新を打ち消す（#1043）。モーダルの外では何もしない
 */
interface ModalNavigation {
  /** モーダル内からの遷移を replace にすべきか（自分のエントリが積まれているか） */
  shouldReplaceNavigation: boolean;
  /** 閉じるのと同時に router で URL を変えることを伝える */
  notifyNavigating: () => void;
}

const ModalNavigationContext = createContext<ModalNavigation>({
  shouldReplaceNavigation: false,
  notifyNavigating: () => {},
});

/**
 * モーダルを閉じるのと同時に router で URL を変えるとき、その直前に呼ぶ。
 *
 * @example
 * ```tsx
 * const { notifyNavigating } = useModalNavigation();
 * const handleApply = () => {
 *   notifyNavigating();
 *   onApply(values); // 内部で router.replace しつつモーダルを閉じる
 * };
 * ```
 */
export function useModalNavigation() {
  return useContext(ModalNavigationContext);
}
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
  /**
   * 履歴エントリを自分で積むか（既定 true）
   *
   * 既定では `useOverlayHistory` で1つ積み、戻るで閉じられるようにする（#1026）。
   *
   * **開閉を URL で持つモーダルは `false` にすること。** ルーターの遷移が既に
   * エントリを1つ積んでいるので、ここでも積むと**開くたびに履歴が2つ伸びる**。
   * 見た目の挙動は正しいままなので気づきにくい（#1033 の実測で判明）。
   */
  manageHistory?: boolean;
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
 * `showCloseButton`（既定 true）のヘッダーの × は「閉じる」という
 * アクセシブルネームを持つ。フッターに同名のボタンを置くと
 * スクリーンリーダーのボタン一覧で区別できなくなるため、
 * 「キャンセル」など別の文言にすること。
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
  manageHistory = true,
}) {
  // 戻る操作で「閉じる」ようにする。履歴に載せないとページごと離脱する（#1026）
  const handleHistoryClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // 進むで戻ってきたら開き直す。開き直せないと次の戻るが空振りする（#1053）
  const handleHistoryReopen = useCallback(() => {
    onOpenChange(true);
  }, [onOpenChange]);

  // 開閉を URL で持つモーダルは、ルーターの遷移が既にエントリを積んでいる。
  // ここでも積むと開くたびに履歴が2つ伸びる
  const { shouldReplaceNavigation, notifyNavigating } = useOverlayHistory(
    manageHistory && open,
    handleHistoryClose,
    handleHistoryReopen,
  );

  const navigationValue = useMemo(
    () => ({ shouldReplaceNavigation, notifyNavigating }),
    [shouldReplaceNavigation, notifyNavigating],
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.c_modal__overlay} />
        <Dialog.Content
          className={contentClassNames}
          /*
            Radix は常に aria-describedby を出すが、`description` が無いときは
            Dialog.Description を描画しないため、存在しないIDを指す
            dangling IDREF になる（ARIA仕様違反・コンソール警告）。
            説明が無いときだけ属性ごと外す。`description` があるときは
            Radix が付けたIDをそのまま使うため、何も渡さない。
          */
          {...(description ? {} : { 'aria-describedby': undefined })}
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
          <ModalNavigationContext.Provider value={navigationValue}>
            {children}
          </ModalNavigationContext.Provider>
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
