/**
 * Cardコンポーネント
 */

'use client';

import { type HTMLAttributes, type ReactNode, memo } from 'react';

import styles from './card.module.scss';

/**
 * Cardコンポーネントのプロパティ
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** カードの内容 */
  children: ReactNode;
  /** クリック可能 */
  clickable?: boolean;
  /** ホバー効果 */
  hoverable?: boolean;
  /** パディングなし */
  noPadding?: boolean;
  /** ボーダーなし */
  noBorder?: boolean;
  /** シャドウなし */
  noShadow?: boolean;
}

/**
 * Cardヘッダーのプロパティ
 */
export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** ヘッダーの内容 */
  children: ReactNode;
}

/**
 * Cardボディのプロパティ
 */
export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  /** ボディの内容 */
  children: ReactNode;
}

/**
 * Cardフッターのプロパティ
 */
export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** フッターの内容 */
  children: ReactNode;
}

/**
 * Cardコンポーネント
 *
 * @example
 * ```tsx
 * <Card clickable hoverable>
 *   <CardHeader>タイトル</CardHeader>
 *   <CardBody>コンテンツ</CardBody>
 *   <CardFooter>フッター</CardFooter>
 * </Card>
 * ```
 */
export const Card = memo<CardProps>(function Card({
  children,
  clickable = false,
  hoverable = false,
  noPadding = false,
  noBorder = false,
  noShadow = false,
  className,
  ...props
}) {
  const classNames = [
    styles.c_card,
    clickable && styles.c_card__clickable,
    hoverable && styles.c_card__hoverable,
    noPadding && styles.c_card__no_padding,
    noBorder && styles.c_card__no_border,
    noShadow && styles.c_card__no_shadow,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
});

Card.displayName = 'Card';

/**
 * Cardヘッダーコンポーネント
 *
 * @example
 * ```tsx
 * <CardHeader>
 *   <h2>タイトル</h2>
 * </CardHeader>
 * ```
 */
export const CardHeader = memo<CardHeaderProps>(function CardHeader({
  children,
  className,
  ...props
}) {
  const classNames = [styles.c_card__header, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
});

CardHeader.displayName = 'CardHeader';

/**
 * Cardボディコンポーネント
 *
 * @example
 * ```tsx
 * <CardBody>
 *   <p>コンテンツ</p>
 * </CardBody>
 * ```
 */
export const CardBody = memo<CardBodyProps>(function CardBody({
  children,
  className,
  ...props
}) {
  const classNames = [styles.c_card__body, className].filter(Boolean).join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
});

CardBody.displayName = 'CardBody';

/**
 * Cardフッターコンポーネント
 *
 * @example
 * ```tsx
 * <CardFooter>
 *   <Button>アクション</Button>
 * </CardFooter>
 * ```
 */
export const CardFooter = memo<CardFooterProps>(function CardFooter({
  children,
  className,
  ...props
}) {
  const classNames = [styles.c_card__footer, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
});

CardFooter.displayName = 'CardFooter';
