/**
 * SideNavコンポーネント
 * サイドバー上部のナビゲーションリンク
 */

'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from '@/constants';
import { useNavAuthGuard } from '@/hooks/useNavAuthGuard';

import styles from './sideNav.module.scss';

/**
 * SideNavコンポーネント
 */
export const SideNav = memo(function SideNav() {
  const pathname = usePathname();
  const { handleProtectedNavClick } = useNavAuthGuard();

  const navItems = useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        ...item,
        isActive: pathname === item.href,
      })),
    [pathname],
  );

  return (
    <nav className={styles.c_side_nav} aria-label='映画ナビゲーション'>
      <ul className={styles.c_side_nav__list}>
        {navItems.map((item) => (
          <li key={item.href} className={styles.c_side_nav__item}>
            <Link
              href={item.href}
              className={`${styles.c_side_nav__link} ${item.isActive ? styles['c_side_nav__link--active'] : ''}`}
              aria-current={item.isActive ? 'page' : undefined}
              onClick={handleProtectedNavClick(item.href)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
});

SideNav.displayName = 'SideNav';
