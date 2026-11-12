/**
 * BottomNavコンポーネント
 * SP 幅だけに出す主要導線のボトムナビゲーション（#1028）
 *
 * 従来 SP の移動手段はドロワーだけで、どこへ行くにも「≡ を押す → 項目を押す」の
 * 2タップが要り、しかも ≡ は画面最上部の左端＝片手で最も届きにくい位置にある。
 * 往復の多い主要導線だけを親指の届く下端へ出し、残りはドロワーに置いたままにする。
 */

'use client';

import { memo, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  IoHomeOutline,
  IoPlayCircleOutline,
  IoSearchOutline,
  IoBookmarkOutline,
  IoHeartOutline,
} from 'react-icons/io5';

import { ARIA_LABELS, ICON_SIZES, ROUTES } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './bottomNav.module.scss';
import { useBottomNavHeight } from './useBottomNavHeight';

/** ボトムナビの項目 */
interface BottomNavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /**
   * 未認証では出さない項目
   *
   * 押しても `LoginPromptModal` が出るだけの導線を、限られた5枠に
   * 常設しない。未認証は3件になる（ログイン誘導はドロワーが持つ）
   */
  requiresAuth?: boolean;
}

/**
 * ボトムナビに出す項目
 *
 * アイコンはドロワー（`mobileDrawer.tsx`）と同じものに揃える。
 * 同じ行き先が画面によって別の絵になると、覚え直しが要る。
 *
 * ここに無い導線（公開予定・受賞作品・シアター体験・設定・ログアウト）は
 * 従来どおりドロワーが持つ。ドロワーからは何も減らしていない
 */
const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  {
    label: 'ホーム',
    href: ROUTES.HOME,
    icon: <IoHomeOutline size={ICON_SIZES.SM} />,
  },
  {
    label: '公開中',
    href: ROUTES.NOW_SHOWING,
    icon: <IoPlayCircleOutline size={ICON_SIZES.SM} />,
  },
  {
    label: '検索',
    href: ROUTES.SEARCH,
    icon: <IoSearchOutline size={ICON_SIZES.SM} />,
  },
  {
    label: 'ウォッチリスト',
    href: ROUTES.WATCHLIST,
    icon: <IoBookmarkOutline size={ICON_SIZES.SM} />,
    requiresAuth: true,
  },
  {
    label: 'お気に入り',
    href: ROUTES.FAVORITES,
    icon: <IoHeartOutline size={ICON_SIZES.SM} />,
    requiresAuth: true,
  },
];

/**
 * BottomNavコンポーネント
 *
 * @example
 * ```tsx
 * <BottomNav />
 * ```
 */
export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();
  const { status } = useSession();
  const navRef = useBottomNavHeight();

  /**
   * `loading` の間は未認証と同じ3件にする。
   *
   * セッションが確定した瞬間に横の並びが 3→5 へ変わる。高さは変わらないので
   * 本文が縦にずれることは無いが、押そうとしていた項目の位置は動きうる。
   * 「先に5件出して未認証なら減らす」ほうが損失が大きい（押せる導線が消える）
   * ため、増える側に倒す。#1028 で承認済みのトレードオフ
   */
  const isAuthenticated = status === 'authenticated';

  const navItems = useMemo(
    () =>
      BOTTOM_NAV_ITEMS.filter(
        (item) => !item.requiresAuth || isAuthenticated,
      ).map((item) => ({ ...item, isActive: pathname === item.href })),
    [isAuthenticated, pathname],
  );

  return (
    <nav
      ref={navRef}
      className={styles.c_bottom_nav}
      aria-label={ARIA_LABELS.PRIMARY_NAV}
    >
      <ul className={styles.c_bottom_nav__list}>
        {navItems.map((item) => (
          <li key={item.href} className={styles.c_bottom_nav__item}>
            {/*
              現在地は aria-current だけで伝える。aria-label に「（現在のページ）」を
              足すと読み上げが二重になる（#1046 と同じ問題）
            */}
            <Link
              href={item.href}
              className={cn(
                styles.c_bottom_nav__link,
                item.isActive && styles['c_bottom_nav__link--active'],
              )}
              aria-current={item.isActive ? 'page' : undefined}
            >
              <span className={styles.c_bottom_nav__icon} aria-hidden='true'>
                {item.icon}
              </span>
              <span className={styles.c_bottom_nav__label}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';
