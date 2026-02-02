/**
 * AppLayoutコンポーネント
 */

'use client';

import { type HTMLAttributes, type ReactNode, memo } from 'react';

import styles from './appLayout.module.scss';

/**
 * AppLayoutコンポーネントのプロパティ
 */
export interface AppLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** ヘッダーコンポーネント */
  header?: ReactNode;
  /** サイドバーコンポーネント */
  sidebar?: ReactNode;
  /** フッターコンポーネント */
  footer?: ReactNode;
  /** メインコンテンツ */
  children: ReactNode;
  /** サイドバーを表示するか */
  showSidebar?: boolean;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * AppLayoutコンポーネント
 *
 * @example
 * ```tsx
 * <AppLayout
 *   header={<Header ... />}
 *   sidebar={<Sidebar ... />}
 *   footer={<Footer ... />}
 *   showSidebar={isLoggedIn}
 * >
 *   <HomePage />
 * </AppLayout>
 * ```
 */
export const AppLayout = memo<AppLayoutProps>(function AppLayout({
  header,
  sidebar,
  footer,
  children,
  showSidebar = true,
  className,
  ...props
}) {
  const classNames = [styles.c_app_layout, className].filter(Boolean).join(' ');

  return (
    <div className={classNames} {...props}>
      {header && <div className={styles.c_app_layout__header}>{header}</div>}

      <div className={styles.c_app_layout__body}>
        {showSidebar && sidebar && (
          <div className={styles.c_app_layout__sidebar}>{sidebar}</div>
        )}

        <main className={styles.c_app_layout__main}>{children}</main>
      </div>

      {footer && <div className={styles.c_app_layout__footer}>{footer}</div>}
    </div>
  );
});

AppLayout.displayName = 'AppLayout';
