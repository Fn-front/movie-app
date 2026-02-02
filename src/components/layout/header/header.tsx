/**
 * Headerコンポーネント
 */

'use client';

import { type HTMLAttributes, type ReactNode, memo } from 'react';
import Link from 'next/link';

import styles from './header.module.scss';

/**
 * Headerコンポーネントのプロパティ
 */
export interface HeaderProps extends HTMLAttributes<HTMLElement> {
  /** ロゴテキスト */
  logoText?: string;
  /** ロゴリンク先 */
  logoHref?: string;
  /** 検索バー（カスタムコンポーネント） */
  searchBar?: ReactNode;
  /** ユーザーメニュー（カスタムコンポーネント） */
  userMenu?: ReactNode;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Headerコンポーネント
 *
 * @example
 * ```tsx
 * <Header
 *   logoText="Movie App"
 *   logoHref="/"
 *   searchBar={<SearchBar onSearch={handleSearch} />}
 *   userMenu={<UserMenu user={user} onLogout={handleLogout} />}
 * />
 * ```
 */
export const Header = memo<HeaderProps>(function Header({
  logoText = 'Movie App',
  logoHref = '/',
  searchBar,
  userMenu,
  className,
  ...props
}) {
  const classNames = [styles.c_header, className].filter(Boolean).join(' ');

  return (
    <header className={classNames} {...props}>
      <div className={styles.c_header__container}>
        <Link href={logoHref} className={styles.c_header__logo}>
          {logoText}
        </Link>

        {searchBar && <div className={styles.c_header__search}>{searchBar}</div>}

        {userMenu && <div className={styles.c_header__user}>{userMenu}</div>}
      </div>
    </header>
  );
});

Header.displayName = 'Header';
