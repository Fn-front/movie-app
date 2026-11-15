/**
 * Buttonコンポーネント
 */

'use client';

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { cn } from '@/utils/cn';

import styles from './button.module.scss';

/**
 * Buttonのバリアント型
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Buttonのサイズ型
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Buttonコンポーネントのプロパティ
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** ボタンのバリアント */
  variant?: ButtonVariant;
  /** ボタンのサイズ */
  size?: ButtonSize;
  /** ボタンの内容 */
  children: ReactNode;
  /** 全幅表示 */
  fullWidth?: boolean;
  /** ローディング状態 */
  isLoading?: boolean;
}

/**
 * Buttonコンポーネント
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   クリック
 * </Button>
 * ```
 */
export const Button = memo<ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  children,
  fullWidth = false,
  isLoading = false,
  className,
  disabled,
  type = 'button',
  onClick,
  ...props
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  /**
   * このボタンを押してローディングに入ったか（#1196）
   *
   * `disabled` になるとブラウザがフォーカスを `<body>` へ落とす。
   * キーボード利用者は、処理が終わって再び押せるようになっても
   * Tab を打ち直すことになる。**押した本人にだけ**戻すための印。
   *
   * ⚠️ 「ローディングが終わったら戻す」だけにしてはいけない。
   * 触っていないボタン（一覧の「もっと見る」等）が読み込みを終えた瞬間に
   * フォーカスを奪う
   */
  const activatedRef = useRef(false);
  const wasLoadingRef = useRef(isLoading);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // Enter / Space での起動も click として届く
      activatedRef.current = true;
      onClick?.(event);
    },
    [onClick],
  );

  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;

    // ローディングが終わった瞬間だけ
    if (!wasLoading || isLoading) return;
    if (!activatedRef.current) return;

    activatedRef.current = false;

    // 誰かがフォーカスを持っていれば奪わない。`disabled` で落ちた場合だけ
    // `<body>` に居る
    if (document.activeElement !== document.body) return;

    buttonRef.current?.focus();
  }, [isLoading]);

  const classNames = cn(
    styles.c_button,
    styles[`c_button__variant__${variant}`],
    styles[`c_button__size__${size}`],
    fullWidth && styles.c_button__full_width,
    isLoading && styles.c_button__loading,
    className,
  );

  return (
    <button
      ref={buttonRef}
      type={type}
      className={classNames}
      disabled={disabled || isLoading}
      // 処理中であることを支援技術にも伝える。`disabled` だけだと
      // 「押せない」としか分からず、待てば押せるのかが伝わらない
      aria-busy={isLoading || undefined}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? (
        <span className={styles.c_button__spinner} aria-hidden='true' />
      ) : null}
      {/*
        ⚠️ ローディング中も**アクセシブルネームを消さない**（#1196）。
        以前は `visibility: hidden` で隠していたが、それでは
        アクセシビリティツリーから外れ、読み上げが「ボタン」だけになる。
        `opacity: 0` なら見た目は同じまま名前が残る
      */}
      <span
        className={cn(
          styles.c_button__content,
          isLoading && styles.c_button__content__hidden,
        )}
      >
        {children}
      </span>
    </button>
  );
});

Button.displayName = 'Button';
