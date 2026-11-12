/**
 * ナビゲーション関連の定数
 */

import type { IconType } from 'react-icons';
import {
  IoBookmarkOutline,
  IoCalendarOutline,
  IoHeartOutline,
  IoHomeOutline,
  IoPlayCircleOutline,
} from 'react-icons/io5';

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
  { label: 'シアター体験', href: ROUTES.THEATER_EXPERIENCE },
];

/**
 * ルートごとのナビゲーションアイコン
 *
 * ドロワーとボトムナビが同じ行き先に同じ絵を使うための真実源。片方だけ
 * 差し替わると、同じ SP 画面で同じ行き先が別の絵になり覚え直しが要る。
 *
 * 要素ではなく**コンポーネント**を持つ。サイズは表示側が `ICON_SIZES` から
 * 決めるので、ここで固定すると使い回せない（この定数は `.ts` なので
 * JSX も書けない）。
 *
 * ⚠️ 受賞作品・シアター体験は未定義のまま残している。ドロワーは
 * `?? null` でアイコン無しに倒れる既知の状態で、#1020 の担当範囲。
 * ここへ足すとあちらの Issue の前提が変わるので触らないこと。
 */
export const NAV_ICON_MAP: Record<string, IconType> = {
  [ROUTES.HOME]: IoHomeOutline,
  [ROUTES.UPCOMING]: IoCalendarOutline,
  [ROUTES.NOW_SHOWING]: IoPlayCircleOutline,
  [ROUTES.FAVORITES]: IoHeartOutline,
  [ROUTES.WATCHLIST]: IoBookmarkOutline,
};

/**
 * メニューアクション項目ラベル
 */
export const MENU_LABELS = {
  CALENDAR: '公開カレンダー',
  SETTINGS: '設定',
  /** admin ロールのみに表示するアカウント管理画面への導線 */
  ADMIN_ACCOUNTS: 'アカウント管理',
  /** admin ロールのみに表示する受賞作品同期画面への導線 */
  ADMIN_AWARD_SYNC: '受賞作品の同期',
  LOGOUT: 'ログアウト',
  LOGIN: 'ログイン',
  DARK_MODE: 'ダークモード',
} as const;

/**
 * 保護ルートをナビゲーションから開こうとした際の、未認証ユーザー向け誘導メッセージ。
 * 「保護対象かどうか」の判定は AUTH_REQUIRED_ROUTES が真実源であり、ここは表示文言のみ。
 * AUTH_REQUIRED_ROUTES のうちナビに出るルートはここに文言を用意し、
 * 未定義のルートは NAV_AUTH_PROMPT_DEFAULT_MESSAGE にフォールバックする。
 */
export const NAV_AUTH_PROMPT_MESSAGES: Record<string, string> = {
  [ROUTES.FAVORITES]: 'お気に入りを見るにはログインが必要です。',
  [ROUTES.WATCHLIST]: 'ウォッチリストを見るにはログインが必要です。',
  [ROUTES.THEATER_EXPERIENCE]: 'シアター体験を見るにはログインが必要です。',
};

/** 保護ルート用メッセージが未定義の場合のデフォルト誘導文言 */
export const NAV_AUTH_PROMPT_DEFAULT_MESSAGE =
  'このページを見るにはログインが必要です。';
