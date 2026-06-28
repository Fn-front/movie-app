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
  { label: 'シアター体験', href: ROUTES.THEATER_EXPERIENCE },
];

/**
 * メニューアクション項目ラベル
 */
export const MENU_LABELS = {
  SETTINGS: '設定',
  LOGOUT: 'ログアウト',
  LOGIN: 'ログイン',
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
