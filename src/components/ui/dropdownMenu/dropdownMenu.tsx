/**
 * DropdownMenuコンポーネント
 */

'use client';

import { type ReactNode, memo, useCallback } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

import styles from './dropdownMenu.module.scss';

/**
 * DropdownMenuItemのプロパティ
 */
export interface DropdownMenuItem {
  /** ラベル */
  label: string;
  /** アイコン */
  icon?: ReactNode;
  /** クリック時のコールバック */
  onClick: () => void;
  /** 無効状態 */
  disabled?: boolean;
  /** 危険なアクション */
  destructive?: boolean;
}

/**
 * DropdownMenuコンポーネントのプロパティ
 */
export interface DropdownMenuProps {
  /** トリガー要素 */
  trigger: ReactNode;
  /** メニューアイテム */
  items: DropdownMenuItem[];
  /** 配置 */
  align?: 'start' | 'center' | 'end';
  /** カスタムクラス名 */
  className?: string;
}

/**
 * DropdownMenuコンポーネント
 *
 * @example
 * ```tsx
 * <DropdownMenu
 *   trigger={<Button>メニュー</Button>}
 *   items={[
 *     { label: 'プロフィール', onClick: handleProfile },
 *     { label: '設定', onClick: handleSettings },
 *     { label: 'ログアウト', onClick: handleLogout, destructive: true },
 *   ]}
 * />
 * ```
 */
export const DropdownMenu = memo<DropdownMenuProps>(function DropdownMenu({
  trigger,
  items,
  align = 'end',
  className,
}) {
  const contentClassNames = [styles.c_dropdown_menu__content, className]
    .filter(Boolean)
    .join(' ');

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild className={styles.c_dropdown_menu__trigger}>
        {trigger}
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          className={contentClassNames}
          align={align}
          sideOffset={8}
        >
          {items.map((item, index) => (
            <DropdownMenuPrimitive.Item
              key={index}
              className={`${styles.c_dropdown_menu__item} ${
                item.destructive ? styles.c_dropdown_menu__item__destructive : ''
              }`}
              onClick={item.onClick}
              disabled={item.disabled}
            >
              {item.icon && (
                <span className={styles.c_dropdown_menu__icon}>{item.icon}</span>
              )}
              <span className={styles.c_dropdown_menu__label}>{item.label}</span>
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
});

DropdownMenu.displayName = 'DropdownMenu';
