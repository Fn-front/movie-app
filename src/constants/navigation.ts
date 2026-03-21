/**
 * ナビゲーション関連の定数
 */

import { ROUTES } from './common';

/**
 * ナビゲーションアイテムの型（アイコンなし）
 */
export interface NavItemBase {
  /** ラベル */
  label: string;
  /** リンク先パス */
  href: string;
}

/**
 * サイドナビゲーション項目
 */
export const NAV_ITEMS: NavItemBase[] = [
  { label: '公開予定', href: ROUTES.UPCOMING },
  { label: '公開中', href: ROUTES.NOW_SHOWING },
  { label: 'お気に入り', href: ROUTES.FAVORITES },
  { label: 'ウォッチリスト', href: ROUTES.WATCHLIST },
  { label: '受賞作品', href: ROUTES.AWARDS },
];

/**
 * メニューアクション項目ラベル
 */
export const MENU_LABELS = {
  SETTINGS: '設定',
  LOGOUT: 'ログアウト',
} as const;
