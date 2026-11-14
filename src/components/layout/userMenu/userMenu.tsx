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
  IoShieldCheckmarkOutline,
  IoLogOutOutline,
  IoLogInOutline,
  IoChevronForward,
  IoSunnyOutline,
  IoMoonOutline,
} from 'react-icons/io5';

import { MENU_LABELS, IMAGE_SIZES } from '@/constants';
import { USER_ROLE } from '@/constants/auth';
import { ROUTES } from '@/constants/common';
import { getInitial } from '@/utils/user';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/utils/cn';

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
  const { data: session } = useSession();
  const { isAuthenticated } = useAuthStatus();
  const {
    handleNavigateToSettings,
    handleNavigateToAdminAccounts,
    handleNavigateToAdminAwardSync,
    handleLogout,
  } = useUserMenu();
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();

  const userName = session?.user?.name ?? '';
  const userEmail = session?.user?.email ?? '';
  const userImage = session?.user?.image;
  const isDark = resolvedTheme === 'dark';
  // 導線を出すかどうかの表示判定のみ。実際の認可は proxy.ts と withAdminAuth が担うため、
  // JWT の role が古く（最大5分）て剥奪直後に残っても、遷移はそちらで弾かれる
  const isAdmin = session?.user?.role === USER_ROLE.ADMIN;

  const initial = useMemo(() => getInitial(userName), [userName]);

  const handleLogin = useCallback(() => {
    router.push(ROUTES.LOGIN);
  }, [router]);

  // トグルしてもメニューは閉じない（onSelect の既定動作を抑止）
  const handleToggleTheme = useCallback(
    (event: Event) => {
      event.preventDefault();
      toggleTheme();
    },
    [toggleTheme],
  );

  // 判定は useAuthStatus に集約（無効化済みセッションの扱いを含む / #1134）。
  // ⚠️ 未確定（isResolving）もここでは未ログイン扱いのままにしている。
  // ログイン導線とアバターで footprint が違うため、中立の表示を置くと
  // 未ログインの利用者に逆のちらつきが出る。#1131 で別途判断する
  if (!isAuthenticated) {
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
            /*
              頭文字は**テキストノードではなく `::before` で描く**（#1069）。
              文字は data-initial から読む（userMenu.module.scss）。

              このボタンは `aria-label` を持つので、頭文字を素のテキストで置くと
              可視テキストが「頭文字 + 表示名」になり、aria-label に含まれなくなる
              （axe: label-content-name-mismatch / WCAG 2.5.3 Label in Name）。

              ⚠️ `aria-hidden='true'` では直らない。axe の
              `labelContentNameMismatchEvaluate` は `visibleVirtual(..., screenReader: false)`
              で**画面に見えている文字**を取るため、aria-hidden を見ない。
              音声入力の利用者には実際に見えている以上、仕様としても正しい。

              ⚠️ 「疑似要素だから支援技術に読まれない」わけではない。accname の
              name-from-content は `::before` / `::after` の生成テキストも含める。
              ここで読まれないのは (1) `aria-label` が名前計算で勝つ
              (2) `button` ロールが children-presentational（axe の標準表でも
              `childrenPresentational: true`）という2点による。
              **この手法を他所へ転用するときは要注意**。`link` ロールは
              children-presentational ではないので、aria-label の無いリンクに
              同じことをすると生成テキストが名前に混ざる。
            */
            <span
              className={styles.c_user_menu__avatar_initial}
              data-initial={initial}
            />
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

          {isAdmin && (
            <>
              <DropdownMenuPrimitive.Item
                className={styles.c_user_menu__item}
                onSelect={handleNavigateToAdminAccounts}
              >
                <span className={styles.c_user_menu__item_icon}>
                  <IoShieldCheckmarkOutline />
                </span>
                <span className={styles.c_user_menu__item_label}>
                  {MENU_LABELS.ADMIN_ACCOUNTS}
                </span>
                <span className={styles.c_user_menu__item_arrow}>
                  <IoChevronForward />
                </span>
              </DropdownMenuPrimitive.Item>

              <DropdownMenuPrimitive.Item
                className={styles.c_user_menu__item}
                onSelect={handleNavigateToAdminAwardSync}
              >
                <span className={styles.c_user_menu__item_icon}>
                  <IoShieldCheckmarkOutline />
                </span>
                <span className={styles.c_user_menu__item_label}>
                  {MENU_LABELS.ADMIN_AWARD_SYNC}
                </span>
                <span className={styles.c_user_menu__item_arrow}>
                  <IoChevronForward />
                </span>
              </DropdownMenuPrimitive.Item>
            </>
          )}

          <DropdownMenuPrimitive.CheckboxItem
            className={styles.c_user_menu__item}
            checked={isDark}
            onSelect={handleToggleTheme}
          >
            <span className={styles.c_user_menu__item_icon}>
              {isDark ? <IoMoonOutline /> : <IoSunnyOutline />}
            </span>
            <span className={styles.c_user_menu__item_label}>
              {MENU_LABELS.DARK_MODE}
            </span>
            <span
              className={cn(
                styles.c_user_menu__switch,
                isDark && styles.c_user_menu__switch__on,
              )}
              aria-hidden='true'
            >
              <span className={styles.c_user_menu__switch_thumb} />
            </span>
          </DropdownMenuPrimitive.CheckboxItem>

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
