/**
 * EmptyStateコンポーネント
 */

'use client';

import { type HTMLAttributes, type ReactNode, memo } from 'react';

import { cn } from '@/utils/cn';

import styles from './emptyState.module.scss';

/**
 * EmptyStateコンポーネントのプロパティ
 */
export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** アイコン */
  icon?: ReactNode;
  /** タイトル */
  title: string;
  /** 説明 */
  description?: string;
  /** アクション */
  action?: ReactNode;
  /** カスタムクラス名 */
  className?: string;
  /**
   * タイトルの見出しレベル
   * 置かれるセクションの階層に合わせる（見出しレベルを飛ばさないため）
   */
  headingLevel?: 2 | 3 | 4;
}

/**
 * EmptyStateコンポーネント
 *
 * @example
 * ```tsx
 * <EmptyState
 *   title="検索結果が見つかりませんでした"
 *   description="別のキーワードで検索してみてください"
 *   action={<Button onClick={handleReset}>検索条件をリセット</Button>}
 * />
 * ```
 */
export const EmptyState = memo<EmptyStateProps>(function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  headingLevel = 3,
  ...props
}) {
  const classNames = cn(styles.c_empty_state, className);
  const Title = `h${headingLevel}` as const;

  return (
    <div className={classNames} {...props}>
      {icon && <div className={styles.c_empty_state__icon}>{icon}</div>}
      <Title className={styles.c_empty_state__title}>{title}</Title>
      {description && (
        <p className={styles.c_empty_state__description}>{description}</p>
      )}
      {action && <div className={styles.c_empty_state__action}>{action}</div>}
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
