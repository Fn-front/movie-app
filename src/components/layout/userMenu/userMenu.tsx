/**
 * UserMenuコンポーネント
 * サイドバー下部に配置するユーザープロフィール + ポップオーバーメニュー
 */

'use client';

import { memo, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  IoSettingsOutline,
  IoLogOutOutline,
  IoChevronForward,
} from 'react-icons/io5';

import { useUserMenu } from './useUserMenu';
import styles from './userMenu.module.scss';

/**
 * ユーザー名からイニシャルを取得
 */
const getInitial = (name: string): string => {
  return name.charAt(0).toUpperCase();
};

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

  const userName = session?.user?.name ?? '';
  const userEmail = session?.user?.email ?? '';
  const userImage = session?.user?.image;

  const initial = useMemo(() => getInitial(userName), [userName]);

  if (status !== 'authenticated' || !session?.user) {
    return null;
  }

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          className={styles.c_user_menu__trigger}
          aria-label='ユーザーメニューを開く'
        >
          {userImage ? (
            <Image
              src={userImage}
              alt={userName}
              width={32}
              height={32}
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
            <span className={styles.c_user_menu__item_label}>設定</span>
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
            <span className={styles.c_user_menu__item_label}>ログアウト</span>
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
});

UserMenu.displayName = 'UserMenu';
