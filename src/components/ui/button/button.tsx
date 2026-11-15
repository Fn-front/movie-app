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
 * 文書内で最後に押された Button（#1196）
 *
 * `disabled` になるとブラウザがフォーカスを `<body>` へ落とすため、
 * 処理が終わって再び押せるようになってもキーボード利用者は Tab を
 * 打ち直すことになる。**押した本人にだけ**フォーカスを戻すための印。
 *
 * ⚠️ インスタンスごとの ref ではなくモジュールスコープで1つだけ持つ。
 * ref だと「押したがローディングに入らなかった」クリックの印が残り、
 * 同じ `isLoading` を共有する別のボタンがローディングを終えたときに
 * 取り違える（`document.activeElement` のガードは tree order で先に
 * effect が走ったほうを通してしまうので防げない）。
 */
let lastActivated: HTMLButtonElement | null = null;

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
  const wasLoadingRef = useRef(isLoading);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // Enter / Space での起動も click として届く
      lastActivated = buttonRef.current;
      onClick?.(event);
    },
    [onClick],
  );

  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;

    // ローディングが終わった瞬間だけ
    if (!wasLoading || isLoading) return;

    // ⚠️ 「押した本人か」をインスタンスごとの ref で持ってはいけない。
    // ローディングに入らなかったクリックの印が残り続け、**別のボタンが**
    // 同じ `isLoading` でローディングを終えたときに、tree order で先に
    // effect が走ったほうがフォーカスを食う。
    // 文書内で最後に押された1つだけを覚えることで、取り違えが起きない
    if (lastActivated !== buttonRef.current) return;

    lastActivated = null;

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
    // ⚠️ `{...props}` を先に置く。後ろに置くと、呼び出し側が渡した値が
    // ここの指定を上書きする。とくに `ref` を奪われると
    // `buttonRef.current` が null のままフォーカス復帰が黙って死ぬ
    // （Radix の `asChild` は型検査を抜けて runtime に ref を注入する）
    <button
      {...props}
      ref={buttonRef}
      type={type}
      className={classNames}
      disabled={disabled || isLoading}
      // 処理中であることを支援技術にも伝える。`disabled` だけだと
      // 「押せない」としか分からず、待てば押せるのかが伝わらない
      aria-busy={isLoading || undefined}
      onClick={handleClick}
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
