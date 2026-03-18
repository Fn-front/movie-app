/**
 * MobileDrawerコンポーネント
 * モバイル用のナビゲーションドロワー（Radix UI Dialog ベース）
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import {
  IoHomeOutline,
  IoCalendarOutline,
  IoPlayCircleOutline,
  IoHeartOutline,
  IoBookmarkOutline,
  IoSettingsOutline,
  IoLogOutOutline,
  IoCloseOutline,
} from 'react-icons/io5';

import { ROUTES, NAV_ITEMS, MENU_LABELS, ICON_SIZES, IMAGE_SIZES } from '@/constants';
import { getInitial } from '@/utils/user';

import styles from './mobileDrawer.module.scss';

/**
 * ナビゲーションアイテムの型（アイコン付き）
 */
interface MobileNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

/**
 * アイコンマッピング
 */
const NAV_ICON_MAP: Record<string, React.ReactNode> = {
  [ROUTES.UPCOMING]: <IoCalendarOutline size={ICON_SIZES.SM} />,
  [ROUTES.NOW_SHOWING]: <IoPlayCircleOutline size={ICON_SIZES.SM} />,
  [ROUTES.FAVORITES]: <IoHeartOutline size={ICON_SIZES.SM} />,
  [ROUTES.WATCHLIST]: <IoBookmarkOutline size={ICON_SIZES.SM} />,
};

/**
 * モバイル用ナビゲーションアイテム一覧（ホーム + 共通NAV_ITEMS）
 */
const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { label: 'ホーム', href: ROUTES.HOME, icon: <IoHomeOutline size={ICON_SIZES.SM} /> },
  ...NAV_ITEMS.map((item) => ({
    ...item,
    icon: NAV_ICON_MAP[item.href] ?? null,
  })),
];

/**
 * MobileDrawerコンポーネントのプロパティ
 */
export interface MobileDrawerProps {
  /** Drawerの開閉状態 */
  open: boolean;
  /** Drawerの開閉コールバック */
  onOpenChange: (open: boolean) => void;
}

/**
 * MobileDrawerコンポーネント
 *
 * @example
 * ```tsx
 * <MobileDrawer open={isOpen} onOpenChange={setIsOpen} />
 * ```
 */
export const MobileDrawer = memo<MobileDrawerProps>(function MobileDrawer({
  open,
  onOpenChange,
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const userName = session?.user?.name ?? '';
  const userEmail = session?.user?.email ?? '';
  const userImage = session?.user?.image;

  const initial = useMemo(() => getInitial(userName), [userName]);

  const navItems = useMemo(
    () =>
      MOBILE_NAV_ITEMS.map((item) => ({
        ...item,
        isActive: pathname === item.href,
      })),
    [pathname],
  );

  const handleNavigateToSettings = useCallback(() => {
    router.push(ROUTES.SETTINGS);
  }, [router]);

  const handleLogout = useCallback(async () => {
    await signOut({ callbackUrl: ROUTES.LOGIN });
  }, []);

  const isAuthenticated = status === 'authenticated' && !!session?.user;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.c_mobile_drawer__overlay} />
        <Dialog.Content
          className={styles.c_mobile_drawer__content}
          aria-label='モバイルメニュー'
          aria-describedby={undefined}
        >
          <div className={styles.c_mobile_drawer__header}>
            <Dialog.Title className={styles.c_mobile_drawer__title}>
              メニュー
            </Dialog.Title>
            <Dialog.Close className={styles.c_mobile_drawer__close}>
              <IoCloseOutline size={ICON_SIZES.MD} aria-hidden='true' />
              <span className='sr-only'>閉じる</span>
            </Dialog.Close>
          </div>

          <nav
            className={styles.c_mobile_drawer__nav}
            aria-label='モバイルナビゲーション'
          >
            <ul className={styles.c_mobile_drawer__nav_list}>
              {navItems.map((item) => (
                <li
                  key={item.href}
                  className={styles.c_mobile_drawer__nav_item}
                >
                  <Link
                    href={item.href}
                    className={`${styles.c_mobile_drawer__nav_link} ${item.isActive ? styles['c_mobile_drawer__nav_link--active'] : ''}`}
                    aria-current={item.isActive ? 'page' : undefined}
                  >
                    <span
                      className={styles.c_mobile_drawer__nav_icon}
                      aria-hidden='true'
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {isAuthenticated && (
            <div className={styles.c_mobile_drawer__user}>
              <div className={styles.c_mobile_drawer__user_info}>
                {userImage ? (
                  <Image
                    src={userImage}
                    alt={userName}
                    width={IMAGE_SIZES.AVATAR_MOBILE.WIDTH}
                    height={IMAGE_SIZES.AVATAR_MOBILE.HEIGHT}
                    className={styles.c_mobile_drawer__user_avatar}
                  />
                ) : (
                  <span className={styles.c_mobile_drawer__user_initial}>
                    {initial}
                  </span>
                )}
                <div className={styles.c_mobile_drawer__user_detail}>
                  <span className={styles.c_mobile_drawer__user_name}>
                    {userName}
                  </span>
                  <span className={styles.c_mobile_drawer__user_email}>
                    {userEmail}
                  </span>
                </div>
              </div>

              <div className={styles.c_mobile_drawer__user_actions}>
                <button
                  type='button'
                  className={styles.c_mobile_drawer__user_action}
                  onClick={handleNavigateToSettings}
                >
                  <IoSettingsOutline size={ICON_SIZES.SM} aria-hidden='true' />
                  <span>{MENU_LABELS.SETTINGS}</span>
                </button>
                <button
                  type='button'
                  className={`${styles.c_mobile_drawer__user_action} ${styles['c_mobile_drawer__user_action--destructive']}`}
                  onClick={handleLogout}
                >
                  <IoLogOutOutline size={ICON_SIZES.SM} aria-hidden='true' />
                  <span>{MENU_LABELS.LOGOUT}</span>
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

MobileDrawer.displayName = 'MobileDrawer';
