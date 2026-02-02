/**
 * Footerコンポーネント
 */

'use client';

import { type HTMLAttributes, type ReactNode, memo } from 'react';
import Link from 'next/link';

import styles from './footer.module.scss';

/**
 * Footerコンポーネントのプロパティ
 */
export interface FooterProps extends HTMLAttributes<HTMLElement> {
  /** コピーライトテキスト */
  copyright?: string;
  /** リンク */
  links?: Array<{
    label: string;
    href: string;
  }>;
  /** カスタムコンテンツ */
  children?: ReactNode;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Footerコンポーネント
 *
 * @example
 * ```tsx
 * <Footer
 *   copyright="© 2024 Movie App"
 *   links={[
 *     { label: '利用規約', href: '/terms' },
 *     { label: 'プライバシーポリシー', href: '/privacy' },
 *   ]}
 * />
 * ```
 */
export const Footer = memo<FooterProps>(function Footer({
  copyright = `© ${new Date().getFullYear()} Movie App`,
  links,
  children,
  className,
  ...props
}) {
  const classNames = [styles.c_footer, className].filter(Boolean).join(' ');

  return (
    <footer className={classNames} {...props}>
      <div className={styles.c_footer__container}>
        <p className={styles.c_footer__copyright}>{copyright}</p>

        {links && links.length > 0 && (
          <nav className={styles.c_footer__nav}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.c_footer__link}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        {children && <div className={styles.c_footer__custom}>{children}</div>}
      </div>
    </footer>
  );
});

Footer.displayName = 'Footer';
