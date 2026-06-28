/**
 * UserMenuコンポーネント
 * サイドバー下部に配置するユーザープロフィール + ポップオーバーメニュー
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  IoSettingsOutline,
  IoLogOutOutline,
  IoLogInOutline,
  IoChevronForward,
} from 'react-icons/io5';

import { MENU_LABELS, IMAGE_SIZES } from '@/constants';
import { ROUTES } from '@/constants/common';
import { getInitial } from '@/utils/user';

import { useUserMenu } from './useUserMenu';
import styles from './userMenu.module.scss';

/**
 * UserMenuコンポーネント
 * セッション情報を内部で取得し、認証済みの場合のみ表示する
 *
 * @example
 * ```tsx
 * <UserMenu />
 * ```
 */
export const UserMenu = memo(function UserMenu() {
  const { data: session, status } = useSession();
  const { handleNavigateToSettings, handleLogout } = useUserMenu();
  const router = useRouter();

  const userName = session?.user?.name ?? '';
  const userEmail = session?.user?.email ?? '';
  const userImage = session?.user?.image;

  const initial = useMemo(() => getInitial(userName), [userName]);

  const handleLogin = useCallback(() => {
    router.push(ROUTES.LOGIN);
  }, [router]);

  if (status !== 'authenticated' || !session?.user) {
    return (
      <button
        className={styles.c_user_menu__login_button}
        onClick={handleLogin}
        aria-label={MENU_LABELS.LOGIN}
      >
        <span className={styles.c_user_menu__login_icon}>
          <IoLogInOutline />
        </span>
        <span className={styles.c_user_menu__name}>{MENU_LABELS.LOGIN}</span>
      </button>
    );
  }

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          className={styles.c_user_menu__trigger}
          aria-label={`${userName} ユーザーメニュー`}
        >
          {userImage ? (
            <Image
              src={userImage}
              alt={userName}
              width={IMAGE_SIZES.AVATAR.WIDTH}
              height={IMAGE_SIZES.AVATAR.HEIGHT}
              className={styles.c_user_menu__avatar}
            />
          ) : (
            <span className={styles.c_user_menu__avatar_initial}>
              {initial}
            </span>
          )}
          <span className={styles.c_user_menu__name}>{userName}</span>
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          className={styles.c_user_menu__content}
          side='top'
          align='start'
          sideOffset={8}
        >
          <DropdownMenuPrimitive.Label className={styles.c_user_menu__label}>
            {userEmail}
          </DropdownMenuPrimitive.Label>

          <DropdownMenuPrimitive.Separator
            className={styles.c_user_menu__separator}
          />

          <DropdownMenuPrimitive.Item
            className={styles.c_user_menu__item}
            onSelect={handleNavigateToSettings}
          >
            <span className={styles.c_user_menu__item_icon}>
              <IoSettingsOutline />
            </span>
            <span className={styles.c_user_menu__item_label}>
              {MENU_LABELS.SETTINGS}
            </span>
            <span className={styles.c_user_menu__item_arrow}>
              <IoChevronForward />
            </span>
          </DropdownMenuPrimitive.Item>

          <DropdownMenuPrimitive.Separator
            className={styles.c_user_menu__separator}
          />

          <DropdownMenuPrimitive.Item
            className={`${styles.c_user_menu__item} ${styles.c_user_menu__item__destructive}`}
            onSelect={handleLogout}
          >
            <span className={styles.c_user_menu__item_icon}>
              <IoLogOutOutline />
            </span>
            <span className={styles.c_user_menu__item_label}>
              {MENU_LABELS.LOGOUT}
            </span>
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
});

UserMenu.displayName = 'UserMenu';
